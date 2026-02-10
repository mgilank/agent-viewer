# Project Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add project tabs feature that allows users to save projects as tabs and quickly switch between them using a tab switcher in the UI.

**Architecture:** Add a projects registry that persists saved projects (name + path + optional icon color). Create a tab bar UI component above the kanban board showing all saved projects. When a tab is clicked, filter the board to show only agents for that project. Add UI to save the current project path as a new tab. Persist tabs to `.project-tabs.json`.

**Tech Stack:** Vanilla JavaScript (frontend), Node.js/Express (backend), JSON file storage for persistence.

---

## Task 1: Add Backend Projects Registry

**Files:**
- Modify: `server.js:14-16` (add TABS_FILE constant)
- Modify: `server.js:18-40` (add tabs registry load/save functions)
- Create: `.project-tabs.json` (empty initially)

**Step 1: Add tabs file constant and registry variables**

After line 15 in `server.js`, add:
```javascript
const TABS_FILE = path.join(__dirname, '.project-tabs.json');
let tabsRegistry = [];
```

**Step 2: Add loadTabsRegistry function**

After the `saveRegistry()` function (around line 40), add:
```javascript
function loadTabsRegistry() {
  try {
    if (fs.existsSync(TABS_FILE)) {
      tabsRegistry = JSON.parse(fs.readFileSync(TABS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load tabs registry:', e.message);
    tabsRegistry = [];
  }
}
```

**Step 3: Add saveTabsRegistry function**

After `loadTabsRegistry()`, add:
```javascript
function saveTabsRegistry() {
  try {
    fs.writeFileSync(TABS_FILE, JSON.stringify(tabsRegistry, null, 2));
  } catch (e) {
    console.error('Failed to save tabs registry:', e.message);
  }
}
```

**Step 4: Call loadTabsRegistry on server start**

After `loadRegistry();` call (around line 913), add:
```javascript
loadTabsRegistry();
```

**Step 5: Test server starts without errors**

Run: `npm start`
Expected: Server starts, no errors about tabs registry

---

## Task 2: Add Tab Management API Routes

**Files:**
- Modify: `server.js:850` (add new API routes before SSE endpoint)

**Step 1: Add GET /api/tabs route**

Before the SSE endpoint comment (around line 879), add:
```javascript
// ─── Project Tabs API ─────────────────────────────────────────────────────

app.get('/api/tabs', (req, res) => {
  try {
    res.json(tabsRegistry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Step 2: Add POST /api/tabs route**

After GET /api/tabs, add:
```javascript
app.post('/api/tabs', (req, res) => {
  try {
    const { name, projectPath, color } = req.body;
    if (!name || !projectPath) {
      return res.status(400).json({ error: 'name and projectPath are required' });
    }

    // Check for duplicate project path
    const existing = tabsRegistry.find(t => t.projectPath === projectPath);
    if (existing) {
      return res.status(400).json({ error: 'Project already saved as a tab' });
    }

    const newTab = {
      id: Date.now().toString(36),
      name,
      projectPath,
      color: color || '#00ff00',
      createdAt: Date.now(),
    };

    tabsRegistry.push(newTab);
    saveTabsRegistry();
    res.json(newTab);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Step 3: Add DELETE /api/tabs/:id route**

After POST /api/tabs, add:
```javascript
app.delete('/api/tabs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const index = tabsRegistry.findIndex(t => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    tabsRegistry.splice(index, 1);
    saveTabsRegistry();
    res.json({ status: 'deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Step 4: Add PUT /api/tabs/:id route (rename/color)**

After DELETE /api/tabs/:id, add:
```javascript
app.put('/api/tabs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const tab = tabsRegistry.find(t => t.id === id);
    if (!tab) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    if (name) tab.name = name;
    if (color) tab.color = color;
    saveTabsRegistry();
    res.json(tab);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**Step 5: Test API endpoints**

Run: `curl http://localhost:4200/api/tabs`
Expected: `[]` (empty array)

---

## Task 3: Add Tab Bar UI Components

**Files:**
- Modify: `public/index.html:52-90` (add tab bar styles)
- Modify: `public/index.html:1126-1133` (add tab bar HTML)

**Step 1: Add tab bar CSS styles**

After the `@keyframes blink` closing brace (around line 90), add:
```css
/* ─── PROJECT TABS ───────────────────────────────────────────────────── */
.project-tabs-bar {
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--bg);
  min-height: 40px;
  gap: 4px;
}

.project-tabs-list {
  display: flex;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
}

.project-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dim);
  font-family: var(--font);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 10px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.1s;
  white-space: nowrap;
}

.project-tab:hover {
  color: var(--white);
  background: rgba(255, 255, 255, 0.03);
}

.project-tab.active {
  color: var(--white);
  border-bottom-color: var(--white);
}

.project-tab .tab-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.project-tab .tab-close {
  opacity: 0;
  font-size: 10px;
  padding: 0 4px;
  margin-left: 4px;
}

.project-tab:hover .tab-close {
  opacity: 0.5;
}

.project-tab .tab-close:hover {
  opacity: 1;
  color: var(--red);
}

.project-tab-all {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dim);
  font-family: var(--font);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.1s;
}

.project-tab-all:hover {
  color: var(--white);
}

.project-tab-all.active {
  color: var(--white);
  border-bottom-color: var(--white);
}

.add-tab-btn {
  background: none;
  border: 1px dashed var(--dim);
  color: var(--dim);
  font-family: var(--font);
  font-size: 16px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.1s;
}

.add-tab-btn:hover {
  border-color: var(--green);
  color: var(--green);
}
```

**Step 2: Add tab bar HTML after header**

Find the closing `</header>` tag (line 1133) and after it, add:
```html
<!-- ─── PROJECT TABS ───────────────────────────────────────────────────── -->
<div class="project-tabs-bar">
  <button class="project-tab-all active" id="tabAll" onclick="selectTab(null)">
    ALL PROJECTS
  </button>
  <div class="project-tabs-list" id="projectTabsList"></div>
  <button class="add-tab-btn" onclick="openAddTabModal()" title="Add current project as tab">+</button>
</div>
```

**Step 3: Test tab bar renders**

Run: `npm start` and open http://localhost:4200
Expected: Tab bar visible below header with "ALL PROJECTS" button and "+" button

---

## Task 4: Add Tab State Management (Frontend)

**Files:**
- Modify: `public/index.html:1251-1257` (add tabs state variables)
- Modify: `public/index.html:2023-2026` (add tab functions before init)

**Step 1: Add tabs state variables**

After `let draggedAgentName = null;` (around line 1257), add:
```javascript
// ─── PROJECT TABS STATE ─────────────────────────────────────────────────
let projectTabs = [];
let selectedTabId = null;
```

**Step 2: Add loadProjectTabs function**

Before the `// ─── INIT ─────────────────────────────────────────────────` comment (around line 2023), add:
```javascript
// ─── PROJECT TABS ───────────────────────────────────────────────────────
async function loadProjectTabs() {
  try {
    const res = await fetch('/api/tabs');
    projectTabs = await res.json();
    renderProjectTabs();
  } catch (e) {
    console.error('Failed to load tabs:', e);
  }
}

function renderProjectTabs() {
  const container = document.getElementById('projectTabsList');
  if (!container) return;

  container.innerHTML = projectTabs.map(tab => `
    <button class="project-tab ${tab.id === selectedTabId ? 'active' : ''}"
            data-tab-id="${tab.id}"
            onclick="selectTab('${tab.id}')">
      <span class="tab-color" style="background: ${tab.color}"></span>
      <span class="tab-name">${escapeHtml(tab.name)}</span>
      <span class="tab-close" onclick="event.stopPropagation(); deleteTab('${tab.id}')">×</span>
    </button>
  `).join('');

  // Update ALL PROJECTS button state
  const tabAll = document.getElementById('tabAll');
  if (tabAll) {
    tabAll.classList.toggle('active', selectedTabId === null);
  }
}

function selectTab(tabId) {
  selectedTabId = tabId;
  renderProjectTabs();
  renderBoard(); // Re-render to filter agents
}

async function deleteTab(tabId) {
  if (!confirm('Remove this project tab?')) return;
  try {
    await fetch(`/api/tabs/${tabId}`, { method: 'DELETE' });
    if (selectedTabId === tabId) selectedTabId = null;
    await loadProjectTabs();
  } catch (e) {
    console.error('Failed to delete tab:', e);
  }
}
```

**Step 3: Update renderBoard to filter by selected tab**

Find the `renderBoard()` function (around line 1297) and modify the filtering at the start:

After the function opening, replace the filtering logic:
```javascript
function renderBoard() {
  let allAgents = agents;

  // Filter by selected tab
  if (selectedTabId) {
    const selectedTab = projectTabs.find(t => t.id === selectedTabId);
    if (selectedTab) {
      allAgents = agents.filter(a => a.projectPath === selectedTab.projectPath);
    }
  }

  const running = allAgents.filter(a => a.state === 'running');
  const idle = allAgents.filter(a => a.state === 'idle');
  const completed = allAgents.filter(a => a.state === 'completed');

  // ... rest of function stays the same
```

**Step 4: Call loadProjectTabs on init**

After `connectSSE();` call in init section (around line 2025), add:
```javascript
loadProjectTabs();
```

**Step 5: Test tab switching**

Run: Open http://localhost:4200
Expected: Tab bar loads, "ALL PROJECTS" is active, no filtering happens yet

---

## Task 5: Add "Save as Tab" Modal

**Files:**
- Modify: `public/index.html:543-578` (reuse modal styles)
- Modify: `public/index.html:1248` (add add tab modal HTML)
- Modify: `public/index.html:1673-1686` (add modal functions)

**Step 1: Add color picker styles to CSS**

After the `.form-field textarea` rule (around line 480), add:
```css
/* ─── COLOR PICKER ───────────────────────────────────────────────────── */
.color-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 28px;
  height: 28px;
  border: 2px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.1s;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.selected {
  border-color: var(--white);
  box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--white);
}
```

**Step 2: Add Add Tab Modal HTML**

After the spawn modal closing `</div>` (around line 1222), add:
```html
<!-- ─── ADD TAB MODAL ─────────────────────────────────────────────────── -->
<div class="modal-overlay" id="addTabModal">
  <div class="modal">
    <div class="modal-header">SAVE PROJECT AS TAB</div>
    <div class="modal-body">
      <div class="form-field">
        <label>TAB NAME</label>
        <div class="input-row">
          <span class="input-prefix">&gt;_</span>
          <input type="text" id="tabName" placeholder="My Project" maxlength="30" />
        </div>
      </div>
      <div class="form-field">
        <label>PROJECT PATH</label>
        <div class="input-row">
          <span class="input-prefix">&gt;_</span>
          <input type="text" id="tabProjectPath" placeholder="/Users/user/project" readonly />
        </div>
      </div>
      <div class="form-field">
        <label>COLOR</label>
        <div class="color-options" id="colorOptions">
          <button type="button" class="color-option selected" style="background: #00ff00" data-color="#00ff00"></button>
          <button type="button" class="color-option" style="background: #ffaa00" data-color="#ffaa00"></button>
          <button type="button" class="color-option" style="background: #bd93f9" data-color="#bd93f9"></button>
          <button type="button" class="color-option" style="background: #ff79c6" data-color="#ff79c6"></button>
          <button type="button" class="color-option" style="background: #8be9fd" data-color="#8be9fd"></button>
          <button type="button" class="color-option" style="background: #50fa7b" data-color="#50fa7b"></button>
          <button type="button" class="color-option" style="background: #f1fa8c" data-color="#f1fa8c"></button>
          <button type="button" class="color-option" style="background: #ff5555" data-color="#ff5555"></button>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeAddTabModal()">CANCEL</button>
      <button class="btn-spawn" onclick="saveTab()">SAVE TAB</button>
    </div>
  </div>
</div>
```

**Step 3: Add modal functions**

After `closeSpawnModal()` function (around line 1686), add:
```javascript
// ─── ADD TAB MODAL ─────────────────────────────────────────────────────
let selectedTabColor = '#00ff00';

function openAddTabModal() {
  // Get most recent project path from agents or recent projects
  const mostRecentPath = getMostRecentProjectPath();
  document.getElementById('tabProjectPath').value = mostRecentPath || '';
  document.getElementById('tabName').value = mostRecentPath ? mostRecentPath.split('/').pop() : '';
  document.getElementById('addTabModal').classList.add('active');
  document.getElementById('tabName').focus();

  // Reset color selection
  selectedTabColor = '#00ff00';
  document.querySelectorAll('.color-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === selectedTabColor);
  });
}

function closeAddTabModal() {
  document.getElementById('addTabModal').classList.remove('active');
}

function getMostRecentProjectPath() {
  // Try to get from agents first
  if (agents.length > 0) {
    const withProject = agents.filter(a => a.projectPath);
    if (withProject.length > 0) {
      return withProject[0].projectPath;
    }
  }
  // Fall back to recent projects
  if (recentProjects.length > 0) {
    return recentProjects[0];
  }
  return '';
}

async function saveTab() {
  const name = document.getElementById('tabName').value.trim();
  const projectPath = document.getElementById('tabProjectPath').value.trim();

  if (!name || !projectPath) {
    alert('Tab name and project path are required');
    return;
  }

  try {
    const res = await fetch('/api/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, projectPath, color: selectedTabColor }),
    });
    const data = await res.json();
    if (data.error) {
      alert('Error: ' + data.error);
      return;
    }
    closeAddTabModal();
    await loadProjectTabs();
    selectTab(data.id);
  } catch (e) {
    alert('Failed to save tab: ' + e.message);
  }
}
```

**Step 4: Add color picker event handlers**

After the `closeProjectDropdown()` click handler (around line 1773), add:
```javascript
// Color picker for add tab modal
document.querySelectorAll('.color-option').forEach(el => {
  el.addEventListener('click', () => {
    selectedTabColor = el.dataset.color;
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.color === selectedTabColor);
    });
  });
});
```

**Step 5: Add keyboard handler to close add tab modal**

Find the `keydown` event listener (around line 1811) and modify the escape handler to include the add tab modal:
```javascript
if (event.key === 'Escape') {
  if (document.getElementById('outputOverlay').classList.contains('active')) {
    closeOutputViewer();
  } else if (document.getElementById('spawnModal').classList.contains('active')) {
    closeSpawnModal();
  } else if (document.getElementById('addTabModal').classList.contains('active')) {
    closeAddTabModal();
  } else if (document.getElementById('confirmOverlay').classList.contains('active')) {
    closeConfirm();
  }
}
```

**Step 6: Test add tab modal**

Run: Open http://localhost:4200, click "+" button
Expected: Modal opens, can enter name, select color, save

---

## Task 6: Mobile Responsive Tabs

**Files:**
- Modify: `public/index.html:844-1114` (add mobile tab bar styles)

**Step 1: Add mobile tab bar styles**

In the `@media (max-width: 768px)` section (after the `header .spawn-btn` rule around line 872), add:
```css
/* Project tabs on mobile */
.project-tabs-bar {
  padding: 8px 12px;
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  min-height: 48px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.project-tabs-list {
  gap: 4px;
}

.project-tab,
.project-tab-all {
  font-size: 10px;
  padding: 8px 12px;
  flex-shrink: 0;
}

.add-tab-btn {
  padding: 6px 12px;
  flex-shrink: 0;
}
```

**Step 2: Test mobile responsive tabs**

Run: Open http://localhost:4200 on mobile or resize browser to < 768px
Expected: Tabs are scrollable, properly sized for touch

---

## Task 7: Persist Current Tab Selection

**Files:**
- Modify: `public/index.html:1258-1260` (add localStorage for tab state)
- Modify: `public/index.html:1990-1995` (save/load tab selection)

**Step 1: Save tab selection to localStorage**

In the `selectTab()` function, add localStorage persistence:
```javascript
function selectTab(tabId) {
  selectedTabId = tabId;
  localStorage.setItem('selectedTabId', tabId || '');
  renderProjectTabs();
  renderBoard(); // Re-render to filter agents
}
```

**Step 2: Load tab selection from localStorage**

After `let selectedTabId = null;` (around line 1260), add:
```javascript
// Restore tab selection from localStorage
try {
  selectedTabId = localStorage.getItem('selectedTabId') || null;
} catch (e) {
  selectedTabId = null;
}
```

**Step 3: Test tab persistence**

Run: Open http://localhost:4200, select a tab, refresh
Expected: Selected tab persists across page reload

---

## Task 8: Add "Quick Add Tab" from Spawn Modal

**Files:**
- Modify: `public/index.html:1216-1220` (add checkbox to spawn modal)

**Step 1: Add "Save as tab" checkbox to spawn modal**

In the spawn modal body, after the prompt field (around line 1215), add:
```html
<div class="form-field" style="display:flex;align-items:center;gap:8px;">
  <input type="checkbox" id="saveAsTab" style="width:auto;flex:none;" />
  <label for="saveAsTab" style="margin:0;cursor:pointer;">SAVE PROJECT AS TAB</label>
</div>
```

**Step 2: Modify spawnAgent to handle tab saving**

In the `spawnAgent()` function, after successful spawn (around line 1478), add:
```javascript
// Check if user wants to save as tab
if (document.getElementById('saveAsTab').checked) {
  const tabName = projectPath.split('/').filter(Boolean).pop();
  fetch('/api/tabs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tabName,
      projectPath,
      color: '#00ff00'
    }),
  }).then(() => loadProjectTabs());
}
```

**Step 3: Test quick add from spawn modal**

Run: Open spawn modal, check "Save as tab", spawn agent
Expected: New tab is created automatically

---

## Task 9: Final Integration & Testing

**Step 1: Restart server and test full flow**

Run: `npm start`

Test the following scenarios:
1. Open page - tab bar shows "ALL PROJECTS" active
2. Click "+" button to add a tab - modal opens
3. Enter name, select color, save - tab appears in bar
4. Click tab - board filters to show only that project's agents
5. Click "ALL PROJECTS" - board shows all agents again
6. Hover over tab - "×" appears to delete
7. Delete tab - confirmation dialog, tab removed
8. Refresh page - selected tab persists
9. Mobile view - tabs scroll horizontally, touch-friendly

**Step 2: Verify persistence**

Check `.project-tabs.json` file exists and contains saved tabs.

Run: `cat /Volumes/Vibe_NVMe/D3V/AgentViewer/.project-tabs.json`
Expected: JSON array of saved tabs

**Step 3: Test edge cases**
- Try to add duplicate project path - should show error
- Delete tab while selected - should switch to "ALL PROJECTS"
- Empty project path - validation error
- Long tab names - truncated visually

**Step 4: Commit all changes**

```bash
git add server.js public/index.html .project-tabs.json docs/plans/2025-02-10-project-tabs-feature.md
git commit -m "feat: add project tabs feature for quick project switching"
```
