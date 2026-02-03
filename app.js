/**
 * SQL Configuration Generator - Tab-Based UI
 */

console.log('=== app.js loading ===');

// ============================================================================
// Global State
// ============================================================================

let allConfigs = [];
let firebaseDb = null;
let pendingConfigType = 'json_set';

const DEFAULTS = {
    tableName: 'StoreStations',
    configColumn: 'Configuration',
    stationColumn: 'StationId',
    storeColumn: 'StoreNo',
    stationId: 'Dispatch'
};

// ============================================================================
// Firebase Configuration
// ============================================================================

const firebaseConfig = {
    apiKey: "AIzaSyBxQvH_DJn9geaVMOuP9v9CjNLonXBpjPw",
    authDomain: "sql-generator-e8ff6.firebaseapp.com",
    databaseURL: "https://sql-generator-e8ff6-default-rtdb.firebaseio.com",
    projectId: "sql-generator-e8ff6",
    storageBucket: "sql-generator-e8ff6.appspot.com",
    messagingSenderId: "481603437589",
    appId: "1:481603437589:web:abc123"
};
    
// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('DOMContentLoaded fired');
        initFirebase();
        console.log('Firebase init done');
        await loadConfigs();
        console.log('Configs loaded');
        renderConfigCards();
        console.log('Cards rendered');
        setupEventListeners();
        console.log('Event listeners set up');
        loadSavedValues();
        console.log('All initialization complete!');
    } catch (error) {
        console.error('INIT ERROR:', error);
        alert('Initialization error: ' + error.message);
    }
});

function initFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
            firebaseDb = firebase.database();
        }
    } catch (error) {
        console.log('Firebase init:', error.message);
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
    }
    
// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
    // Tab switching
    setupTabSwitching();
    
    // JSON_SET Generator Form
    const generatorForm = document.getElementById('quickGeneratorForm');
    if (generatorForm) {
        console.log('Generator form found, attaching submit listener');
        generatorForm.addEventListener('submit', (e) => {
            console.log('Form submit event triggered');
            e.preventDefault();
            e.stopPropagation();
            generateFromQuickForm();
            return false;
        });
    } else {
        console.error('quickGeneratorForm not found!');
    }
    
    // Add path/value row
    const addPathBtn = document.getElementById('addPathValueBtn');
    if (addPathBtn) {
        addPathBtn.addEventListener('click', addPathValueRow);
    }
    
    // Save JSON_SET config
    const saveJsonSetBtn = document.getElementById('saveJsonSetBtn');
    if (saveJsonSetBtn) {
        saveJsonSetBtn.addEventListener('click', () => openSaveModal('json_set'));
    }
    
    // Free SQL Form
    const freeSqlForm = document.getElementById('freeSqlForm');
    if (freeSqlForm) {
        freeSqlForm.addEventListener('submit', (e) => {
        e.preventDefault();
            generateFromFreeSql();
    });
    }
    
    // Save Free SQL config
    const saveFreeSqlBtn = document.getElementById('saveFreeSqlBtn');
    if (saveFreeSqlBtn) {
        saveFreeSqlBtn.addEventListener('click', () => openSaveModal('free_sql'));
    }
    
    // Search configs
    const searchInput = document.getElementById('searchConfigs');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderConfigCards(e.target.value));
    }
    
    // Global StoreNos
    const storeNosInput = document.getElementById('globalStoreNos');
    if (storeNosInput) {
        storeNosInput.addEventListener('input', updateStoreNosCount);
    }
    
    // Output controls
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
    
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearOutput);
    
    // Save Config Modal
    const saveConfigForm = document.getElementById('saveConfigForm');
    if (saveConfigForm) {
        saveConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveConfig();
        });
    }
    
    const closeModalBtn = document.getElementById('closeSaveConfigModal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    const cancelBtn = document.getElementById('cancelSaveConfig');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
}

// ============================================================================
// Config Loading & Saving
// ============================================================================

async function loadConfigs() {
    const localConfigs = JSON.parse(localStorage.getItem('sqlConfigs') || '[]');
    
    let sharedConfigs = [];
    if (firebaseDb) {
        try {
            const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
            const data = snapshot.val();
            if (data) {
                sharedConfigs = Array.isArray(data) ? data : Object.values(data);
                sharedConfigs = sharedConfigs.map(c => ({ ...c, isShared: true }));
                }
        } catch (error) {
            console.log('Firebase load:', error.message);
                }
    }
    
    const localIds = new Set(localConfigs.map(c => c.id));
    allConfigs = [...localConfigs, ...sharedConfigs.filter(c => !localIds.has(c.id))];
    }
    
function saveLocalConfigs() {
    const localConfigs = allConfigs.filter(c => !c.isShared);
    localStorage.setItem('sqlConfigs', JSON.stringify(localConfigs));
}

// ============================================================================
// JSON_SET Generator
// ============================================================================

function addPathValueRow() {
    const container = document.getElementById('pathValueRows');
    const index = container.querySelectorAll('.path-value-row').length;
    
    const row = document.createElement('div');
    row.className = 'path-value-row';
    row.dataset.index = index;
    row.innerHTML = `
        <div class="form-group path-group">
            <label>JSON Path</label>
            <input type="text" class="json-path" placeholder="$.configKey">
        </div>
        <div class="form-group value-group">
            <label>Value</label>
            <input type="text" class="json-value" placeholder="true">
        </div>
        <div class="form-group type-group">
            <label>Type</label>
            <select class="value-type">
                <option value="boolean">Boolean</option>
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="null">Null</option>
            </select>
        </div>
        <button type="button" class="btn-icon btn-remove-row" title="Remove" onclick="this.closest('.path-value-row').remove(); updateRemoveButtons();">×</button>
    `;
    container.appendChild(row);
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const rows = document.querySelectorAll('#pathValueRows .path-value-row');
    rows.forEach(row => {
        const btn = row.querySelector('.btn-remove-row');
        if (btn) btn.style.visibility = rows.length > 1 ? 'visible' : 'hidden';
    });
}

function getFormData() {
    const stationId = document.getElementById('stationId')?.value.trim() || DEFAULTS.stationId;
    const tableName = document.getElementById('tableName')?.value.trim() || DEFAULTS.tableName;
    const configColumn = document.getElementById('configColumn')?.value.trim() || DEFAULTS.configColumn;
    const stationColumn = document.getElementById('stationColumn')?.value.trim() || DEFAULTS.stationColumn;
    const storeColumn = document.getElementById('storeColumn')?.value.trim() || DEFAULTS.storeColumn;
    
    const rows = [];
    document.querySelectorAll('#pathValueRows .path-value-row').forEach(row => {
        const path = row.querySelector('.json-path')?.value.trim();
        const value = row.querySelector('.json-value')?.value.trim();
        const type = row.querySelector('.value-type')?.value;
        if (path) rows.push({ path: ensureJsonPath(path), value, type });
    });
    
    return { stationId, tableName, configColumn, stationColumn, storeColumn, rows };
}

function generateFromQuickForm() {
    console.log('generateFromQuickForm called');
    const data = getFormData();
    console.log('Form data:', data);
    
    if (data.rows.length === 0) {
        alert('Please add at least one JSON path');
        return;
    }
    
    const storeNos = getStoreNos();
    console.log('StoreNos:', storeNos);
    
    const sql = generateJsonSetSql(data, storeNos);
    console.log('Generated SQL:', sql);
    
    showOutput(sql);
    saveLastUsed();
}

function generateJsonSetSql(data, storeNos) {
    const args = data.rows.map(r => `'${r.path}', ${formatValue(r.type, r.value)}`).join(',\n        ');
    
    let sql = `UPDATE ${data.tableName}
SET ${data.configColumn} = JSON_SET(
        ${data.configColumn},
        ${args}
)
WHERE ${data.stationColumn} = '${escapeSql(data.stationId)}'`;
    
    if (storeNos.length > 0) {
        sql += `\nAND ${data.storeColumn} IN (${storeNos.join(', ')})`;
    }
    
    return sql + ';';
}

// ============================================================================
// Free SQL
// ============================================================================

function generateFromFreeSql() {
    const sql = document.getElementById('freeSqlInput')?.value.trim();
    if (!sql) {
        alert('Please enter SQL');
        return;
    }
    
    let result = sql;
    const appendFilter = document.getElementById('appendStoreFilter')?.checked;
    const storeNos = getStoreNos();
    
    if (appendFilter && storeNos.length > 0) {
        result = appendStoreFilter(sql, storeNos);
}

    showOutput(result);
}

function appendStoreFilter(sql, storeNos) {
    const filter = `${DEFAULTS.storeColumn} IN (${storeNos.join(', ')})`;
    const hasWhere = /\bWHERE\b/i.test(sql);
    
    if (hasWhere) {
        return sql.replace(/;?\s*$/, `\nAND ${filter};`);
    } else {
        return sql.replace(/;?\s*$/, `\nWHERE ${filter};`);
    }
}

// ============================================================================
// Config Cards
// ============================================================================

function renderConfigCards(search = '') {
    const container = document.getElementById('configsGrid');
    if (!container) return;
    
    let configs = allConfigs;
    if (search) {
        const term = search.toLowerCase();
        configs = configs.filter(c => 
            c.title?.toLowerCase().includes(term) || 
            c.description?.toLowerCase().includes(term)
        );
    }
    
    if (configs.length === 0) {
        container.innerHTML = '<p class="empty-state">No saved configurations yet.</p>';
        return;
    }
    
    container.innerHTML = configs.map(c => {
        const typeClass = c.kind === 'free_sql' ? 'free-sql' : '';
        const typeLabel = c.kind === 'free_sql' ? 'SQL' : 'JSON';
        const shared = c.isShared ? '<span class="shared-badge">SHARED</span>' : '';
        
        return `
            <div class="config-card" data-id="${c.id}">
                <div class="config-card-menu">
                    <button class="btn-icon-small" onclick="event.stopPropagation(); deleteConfig('${c.id}')" title="Delete">🗑</button>
                    ${!c.isShared ? `<button class="btn-icon-small" onclick="event.stopPropagation(); shareConfig('${c.id}')" title="Share">↗</button>` : ''}
                </div>
                <div class="config-card-title">
                    ${escapeHtml(c.title)}${shared}
                    <span class="config-card-type ${typeClass}">${typeLabel}</span>
                </div>
                ${c.description ? `<div class="config-card-desc">${escapeHtml(c.description)}</div>` : ''}
                <div class="config-card-actions">
                    <button class="btn btn-primary" onclick="generateFromConfig('${c.id}')">Generate</button>
                    <button class="btn btn-secondary" onclick="loadConfig('${c.id}')">Load</button>
                </div>
            </div>
        `;
    }).join('');
}

function generateFromConfig(id) {
    const config = allConfigs.find(c => c.id === id);
    if (!config) return;
    
    const storeNos = getStoreNos();
    let sql;
    
    if (config.kind === 'free_sql') {
        sql = config.sqlScript || '';
        if (config.defaultAppendFilter && storeNos.length > 0) {
            sql = appendStoreFilter(sql, storeNos);
        }
    } else {
        sql = generateJsonSetSql({
            stationId: config.stationId || DEFAULTS.stationId,
            tableName: config.tableName || DEFAULTS.tableName,
            configColumn: config.configColumn || DEFAULTS.configColumn,
            stationColumn: config.stationColumn || DEFAULTS.stationColumn,
            storeColumn: config.storeColumn || DEFAULTS.storeColumn,
            rows: config.rows || [{ path: config.jsonPath, value: config.value, type: config.valueType }]
        }, storeNos);
}

    showOutput(sql);
}

function loadConfig(id) {
    const config = allConfigs.find(c => c.id === id);
    if (!config) return;
    
    if (config.kind === 'free_sql') {
        switchTab('freesql');
        document.getElementById('freeSqlInput').value = config.sqlScript || '';
        document.getElementById('appendStoreFilter').checked = config.defaultAppendFilter || false;
    } else {
        switchTab('jsonset');
        document.getElementById('stationId').value = config.stationId || DEFAULTS.stationId;
        
        const container = document.getElementById('pathValueRows');
        const rows = config.rows || [{ path: config.jsonPath, value: config.value, type: config.valueType }];
        
        container.innerHTML = rows.map((r, i) => `
            <div class="path-value-row" data-index="${i}">
                <div class="form-group path-group">
                    <label>JSON Path</label>
                    <input type="text" class="json-path" value="${escapeHtml(r.path || '')}">
                </div>
                <div class="form-group value-group">
                    <label>Value</label>
                    <input type="text" class="json-value" value="${escapeHtml(String(r.value || ''))}">
                </div>
                <div class="form-group type-group">
                    <label>Type</label>
                    <select class="value-type">
                        <option value="boolean" ${r.type === 'boolean' ? 'selected' : ''}>Boolean</option>
                        <option value="string" ${r.type === 'string' ? 'selected' : ''}>String</option>
                        <option value="number" ${r.type === 'number' ? 'selected' : ''}>Number</option>
                        <option value="null" ${r.type === 'null' ? 'selected' : ''}>Null</option>
                    </select>
                </div>
                <button type="button" class="btn-icon btn-remove-row" title="Remove" onclick="this.closest('.path-value-row').remove(); updateRemoveButtons();" style="visibility: ${rows.length > 1 ? 'visible' : 'hidden'};">×</button>
            </div>
        `).join('');
    }
}

// ============================================================================
// Save Modal
// ============================================================================

function openSaveModal(type) {
    console.log('openSaveModal called with type:', type);
    pendingConfigType = type;
    const modal = document.getElementById('saveConfigModal');
    console.log('Modal element:', modal);
    if (modal) {
        modal.style.display = 'flex';
        const titleInput = document.getElementById('configTitle');
        const descInput = document.getElementById('configDescription');
        if (titleInput) titleInput.value = '';
        if (descInput) descInput.value = '';
        if (titleInput) titleInput.focus();
        console.log('Modal opened');
    } else {
        alert('Modal not found!');
}
}

function closeModal() {
    const modal = document.getElementById('saveConfigModal');
    if (modal) modal.style.display = 'none';
}

function saveConfig() {
    console.log('saveConfig called');
    const title = document.getElementById('configTitle')?.value.trim();
    console.log('Title:', title);
    
    if (!title) {
        alert('Title is required');
        return;
    }
    
    const description = document.getElementById('configDescription')?.value.trim();
    
    let config = {
        id: 'config_' + Date.now(),
        title,
        description: description || undefined,
        createdAt: new Date().toISOString()
    };
    console.log('Config to save:', config);
    
    if (pendingConfigType === 'free_sql') {
        config.kind = 'free_sql';
        config.sqlScript = document.getElementById('freeSqlInput')?.value.trim();
        config.defaultAppendFilter = document.getElementById('appendStoreFilter')?.checked;
    } else {
        config.kind = 'json_set';
        const data = getFormData();
        Object.assign(config, data);
    }
    
    allConfigs.unshift(config);
    saveLocalConfigs();
    console.log('Config saved, total configs:', allConfigs.length);
    renderConfigCards();
    closeModal();
    
    // Switch to saved tab to show new config
    switchTab('saved');
    
    // Show success
    alert('Configuration saved: ' + title);
}

async function deleteConfig(id) {
    const config = allConfigs.find(c => c.id === id);
    if (!config || !confirm(`Delete "${config.title}"?`)) return;
    
    allConfigs = allConfigs.filter(c => c.id !== id);
    
    if (config.isShared && firebaseDb) {
        try {
            const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
            let shared = snapshot.val() || [];
            if (!Array.isArray(shared)) shared = Object.values(shared);
            shared = shared.filter(c => c.id !== id);
            await firebaseDb.ref('sharedConfigs').set(shared);
        } catch (e) { console.log('Delete error:', e); }
    } else {
        saveLocalConfigs();
}

    renderConfigCards();
}

async function shareConfig(id) {
    const config = allConfigs.find(c => c.id === id);
    if (!config || config.isShared || !firebaseDb) return;
    
    if (!confirm(`Share "${config.title}"?`)) return;
    
    try {
        const snapshot = await firebaseDb.ref('sharedConfigs').once('value');
        let shared = snapshot.val() || [];
        if (!Array.isArray(shared)) shared = Object.values(shared);
        
        const toShare = { ...config };
        delete toShare.isShared;
        shared.push(toShare);
        
        await firebaseDb.ref('sharedConfigs').set(shared);
        config.isShared = true;
        renderConfigCards();
        alert('Shared!');
    } catch (e) {
        alert('Share failed');
    }
}

// ============================================================================
// Output
// ============================================================================

function showOutput(sql) {
    console.log('showOutput called with:', sql);
    const section = document.getElementById('outputSection');
    const output = document.getElementById('sqlOutput');
    console.log('Output section:', section, 'Output element:', output);
        
    if (section && output) {
        output.textContent = sql;
        section.style.display = 'block';
        console.log('Output displayed');
        section.scrollIntoView({ behavior: 'smooth' });
    } else {
        console.error('Output elements not found!');
        alert('Generated SQL:\n\n' + sql);
    }
}

function clearOutput() {
    document.getElementById('outputSection').style.display = 'none';
}

function copyToClipboard() {
    const sql = document.getElementById('sqlOutput')?.textContent;
    if (sql) {
        navigator.clipboard.writeText(sql).then(() => {
            const confirm = document.getElementById('copyConfirmation');
            if (confirm) {
                confirm.style.display = 'block';
                setTimeout(() => confirm.style.display = 'none', 2000);
            }
        });
    }
}

// ============================================================================
// StoreNos
// ============================================================================

function getStoreNos() {
    const input = document.getElementById('globalStoreNos')?.value.trim();
    if (!input) return [];
    
    const stores = new Set();
    input.split(/[,\n\s]+/).forEach(part => {
        part = part.trim();
        const range = part.match(/^(\d+)-(\d+)$/);
        if (range) {
            const [, start, end] = range.map(Number);
            for (let i = Math.min(start, end); i <= Math.max(start, end); i++) stores.add(i);
        } else if (/^\d+$/.test(part)) {
            stores.add(parseInt(part));
}
    });
    
    return Array.from(stores).sort((a, b) => a - b);
}

function updateStoreNosCount() {
    const stores = getStoreNos();
    const el = document.getElementById('storeNosCount');
    if (el) el.textContent = stores.length ? `${stores.length} store${stores.length > 1 ? 's' : ''}` : '';
    localStorage.setItem('lastStoreNos', document.getElementById('globalStoreNos')?.value || '');
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeSql(str) {
    return str ? str.replace(/'/g, "''") : '';
}

function ensureJsonPath(path) {
    path = path?.trim() || '';
    return path.startsWith('$') ? path : '$.' + path;
}

function formatValue(type, value) {
    if (type === 'null') return 'NULL';
    if (type === 'boolean') return value === 'true' || value === true ? 'true' : 'false';
    if (type === 'number') return isNaN(parseFloat(value)) ? '0' : String(parseFloat(value));
    return "'" + escapeSql(value) + "'";
}

function loadSavedValues() {
    const storeNos = localStorage.getItem('lastStoreNos');
    if (storeNos) {
        const input = document.getElementById('globalStoreNos');
        if (input) input.value = storeNos;
        updateStoreNosCount();
    }
}

function saveLastUsed() {
    localStorage.setItem('lastStoreNos', document.getElementById('globalStoreNos')?.value || '');
}
