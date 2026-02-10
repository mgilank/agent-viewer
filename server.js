const express = require('express');
const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 4200;
const REGISTRY_FILE = path.join(__dirname, '.agent-registry.json');
const TABS_FILE = path.join(__dirname, '.project-tabs.json');
const TELEGRAM_CONFIG_FILE = path.join(__dirname, '.telegram-config.json');
const POLL_INTERVAL = 3000;
const SPAWN_PREFIX = 'agent-';

let tabsRegistry = [];
let telegramConfig = { botToken: '', chatId: '', enabled: false };

// ─── Agent Registry ──────────────────────────────────────────────────────────

let registry = {};
const nonClaudeCache = new Map(); // sessionName -> timestamp (skip re-checking)

function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load registry:', e.message);
    registry = {};
  }
}

function saveRegistry() {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  } catch (e) {
    console.error('Failed to save registry:', e.message);
  }
}

// ─── Tabs Registry ───────────────────────────────────────────────────────────

function loadTabsRegistry() {
  try {
    if (fs.existsSync(TABS_FILE)) {
      const content = fs.readFileSync(TABS_FILE, 'utf-8');

      // Handle empty file
      if (!content || content.trim() === '') {
        console.log('[TABS] Empty tabs file, initializing with empty array');
        tabsRegistry = [];
        return;
      }

      const parsed = JSON.parse(content);

      // Ensure we always have an array
      if (!Array.isArray(parsed)) {
        console.error('[TABS] Invalid tabs file format (not an array), resetting');
        tabsRegistry = [];
        return;
      }

      tabsRegistry = parsed;
      console.log(`[TABS] Loaded ${tabsRegistry.length} tab(s) from ${TABS_FILE}`);
    } else {
      console.log('[TABS] No tabs file found, starting with empty registry');
      tabsRegistry = [];
    }
  } catch (e) {
    console.error('[TABS] Failed to load tabs registry:', e.message);
    console.log('[TABS] Initializing with empty array');
    tabsRegistry = [];
  }
}

function saveTabsRegistry() {
  try {
    // Ensure tabsRegistry is always an array
    if (!Array.isArray(tabsRegistry)) {
      console.error('[TABS] Invalid tabsRegistry, resetting to empty array');
      tabsRegistry = [];
    }

    const content = JSON.stringify(tabsRegistry, null, 2);

    // Use atomic write pattern: write to temp file, then rename
    // This prevents file corruption if write is interrupted
    const tmpFile = TABS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, content, 'utf-8');

    // On Windows, the destination file must be removed before rename
    // On Unix, fs.rename automatically overwrites
    if (fs.existsSync(TABS_FILE)) {
      fs.unlinkSync(TABS_FILE);
    }

    fs.renameSync(tmpFile, TABS_FILE);

    console.log(`[TABS] Saved ${tabsRegistry.length} tab(s) to ${TABS_FILE}`);
  } catch (e) {
    console.error('[TABS] Failed to save tabs registry:', e.message);
  }
}

// ─── Telegram Config ─────────────────────────────────────────────────────────

function loadTelegramConfig() {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const content = fs.readFileSync(TELEGRAM_CONFIG_FILE, 'utf-8');
      if (content && content.trim() !== '') {
        telegramConfig = JSON.parse(content);
        console.log('[TELEGRAM] Config loaded');
      }
    }
  } catch (e) {
    console.error('[TELEGRAM] Failed to load config:', e.message);
    telegramConfig = { botToken: '', chatId: '', enabled: false };
  }
}

function saveTelegramConfig() {
  try {
    const content = JSON.stringify(telegramConfig, null, 2);
    const tmpFile = TELEGRAM_CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmpFile, content, 'utf-8');

    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      fs.unlinkSync(TELEGRAM_CONFIG_FILE);
    }

    fs.renameSync(tmpFile, TELEGRAM_CONFIG_FILE);
    console.log('[TELEGRAM] Config saved');
  } catch (e) {
    console.error('[TELEGRAM] Failed to save config:', e.message);
  }
}

// ─── Label Generation (LLM-powered) ─────────────────────────────────────────

console.log('[LABEL] Using claude CLI for smart label generation');

function fallbackLabel(text) {
  if (!text) return 'task-' + Date.now().toString(36);
  const stop = new Set(['the','a','an','in','on','at','to','for','of','with','and','or','but','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','can','that','this','it','its','i','me','my','we','our','you','your','they','them','their','he','him','his','she','her','from','by','as','all','so','if','then','than','too','very','just','about','up','out','into','over','please','make']);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w && !stop.has(w));
  return words.slice(0, 4).join('-') || 'task-' + Date.now().toString(36);
}

function callClaude(systemPrompt, userText) {
  return new Promise((resolve, reject) => {
    const prompt = `${systemPrompt}\n\n${userText}`;
    const escaped = prompt.replace(/'/g, "'\\''");
    exec(
      `echo '${escaped}' | claude --print --model haiku 2>/dev/null`,
      { encoding: 'utf-8', timeout: 15000 },
      (err, stdout) => {
        if (err) {
          console.log(`[LABEL-CLI] Failed: ${err.message.substring(0, 100)}`);
          return reject(err);
        }
        const result = stdout.trim();
        console.log(`[LABEL-CLI] Response: "${result}"`);
        resolve(result);
      }
    );
  });
}

async function generateSmartLabel(text) {
  try {
    const raw = await callClaude(
      'Generate a short label (2-4 lowercase words, hyphenated, no quotes) summarizing this coding task. Reply with ONLY the label.',
      text.substring(0, 300)
    );
    // Sanitize: lowercase, hyphenated, no special chars
    const label = raw.toLowerCase().replace(/[^a-z0-9-\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (label && label.length > 2 && label.length < 60) return label;
  } catch (e) {
    console.log(`[LABEL] LLM fallback: ${e.message}`);
  }
  return fallbackLabel(text);
}

// Update a discovered agent's label from pane output (async, non-blocking)
async function refreshDiscoveredLabel(sessionName) {
  const reg = registry[sessionName];
  if (!reg || !reg.discovered || reg.labelRefreshed) return;

  const rawOutput = capturePaneOutput(sessionName, 30);
  const output = stripAnsi(rawOutput).trim();
  console.log(`[LABEL] Refreshing label for ${sessionName}, output length: ${output.length}`);
  if (!output || output.length < 20) {
    console.log(`[LABEL] Not enough output yet for ${sessionName}`);
    return;
  }

  reg.labelRefreshed = true;
  try {
    const label = await callClaude(
      'This is terminal output from a Claude Code AI agent working on a coding task. Generate a short label (2-4 lowercase words, hyphenated, no quotes) summarizing what this agent is doing. Reply with ONLY the label.',
      output.substring(0, 500)
    );
    console.log(`[LABEL] Haiku returned for ${sessionName}: "${label}"`);
    const clean = label.toLowerCase().replace(/[^a-z0-9-\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (clean && clean.length > 2 && clean.length < 60) {
      reg.label = clean;
      saveRegistry();
      console.log(`[LABEL] Discovered agent ${sessionName} labeled: ${clean}`);
    } else {
      console.log(`[LABEL] Rejected cleaned label: "${clean}"`);
    }
  } catch (e) {
    console.log(`[LABEL] Failed for ${sessionName}: ${e.message}`);
    reg.labelRefreshed = false; // Allow retry
  }
}

// ─── ANSI Stripping ──────────────────────────────────────────────────────────

function stripAnsi(str) {
  return str.replace(/\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07|\([A-Z0-9])/g, '')
            .replace(/\x1B\[[\?]?[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1B[^[\]()][^\x1B]*/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// ─── Process Tree (for Claude detection) ─────────────────────────────────────

function buildProcessTree() {
  try {
    const psOutput = execSync('ps -ax -o pid= -o ppid= -o command=', {
      encoding: 'utf-8', timeout: 5000
    });
    const children = {};
    const commands = {};

    for (const line of psOutput.trim().split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (match) {
        const [, pid, ppid, cmd] = match;
        commands[pid] = cmd.trim();
        if (!children[ppid]) children[ppid] = [];
        children[ppid].push(pid);
      }
    }
    return { children, commands };
  } catch {
    return { children: {}, commands: {} };
  }
}

function hasClaudeDescendant(pid, tree) {
  const queue = [String(pid)];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const cmd = tree.commands[current] || '';
    // Match "claude" as a command (not "agent-viewer" or other incidental matches)
    if (/(?:^|\/)claude\s/.test(cmd) || /(?:^|\/)claude$/.test(cmd)) {
      return true;
    }

    const kids = tree.children[current] || [];
    queue.push(...kids);
  }
  return false;
}

// ─── Tmux Integration ────────────────────────────────────────────────────────

function listTmuxSessions() {
  try {
    const output = execSync(
      "tmux list-sessions -F '#{session_name}|#{session_activity}|#{session_created}' 2>/dev/null",
      { encoding: 'utf-8', timeout: 5000 }
    );
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [name, activity, created] = line.split('|');
      return { name, activity: parseInt(activity) * 1000, created: parseInt(created) * 1000 };
    });
  } catch {
    return [];
  }
}

function capturePaneOutput(sessionName, lines = 200) {
  try {
    const output = execSync(
      `tmux capture-pane -e -t ${sessionName} -p -S -${lines} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return output;
  } catch {
    return '';
  }
}

function getSessionPid(sessionName) {
  try {
    const output = execSync(
      `tmux list-panes -t ${sessionName} -F '#{pane_pid}' 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return parseInt(output.trim());
  } catch {
    return null;
  }
}

function getPaneCurrentPath(sessionName) {
  try {
    return execSync(
      `tmux display-message -t ${sessionName} -p '#{pane_current_path}' 2>/dev/null`,
      { encoding: 'utf-8', timeout: 3000 }
    ).trim();
  } catch {
    return '';
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll tmux pane until Claude Code is ready for input (showing prompt).
 * Returns true if ready, false if timed out.
 */
async function waitForClaudeReady(sessionName, timeoutMs = 30000) {
  const pollInterval = 500;
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval));

    const rawOutput = capturePaneOutput(sessionName, 30);
    const output = stripAnsi(rawOutput);
    const lines = output.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) continue;

    const recentText = lines.slice(-8).map(l => l.trim()).join('\n');

    // Detect interactive prompts that block Claude startup and dismiss them:
    // 1. Bypass-permissions trust prompt: "No, exit" / "Yes, I accept"
    // 2. Settings error prompt: "Exit and fix manually" / "Continue without these settings"
    // Both need Down (to select option 2) then Enter to proceed.
    if (/Enter to confirm/i.test(recentText)) {
      const needsDown = (/No, exit/i.test(recentText) && /Yes, I accept/i.test(recentText))
        || (/Exit and fix manually/i.test(recentText) && /Continue without/i.test(recentText));

      if (needsDown) {
        console.log(`[SPAWN] Selection prompt detected for ${sessionName}, selecting option 2...`);
        try {
          execSync(`tmux send-keys -t ${sessionName} Down`, { encoding: 'utf-8', timeout: 3000 });
          await new Promise(r => setTimeout(r, 200));
          execSync(`tmux send-keys -t ${sessionName} Enter`, { encoding: 'utf-8', timeout: 3000 });
        } catch (e) {
          console.log(`[SPAWN] Failed to dismiss prompt for ${sessionName}: ${e.message}`);
        }
        continue;
      }

      // Info-only prompts (e.g. Chrome extension notice): just press Enter
      console.log(`[SPAWN] Info prompt detected for ${sessionName}, pressing Enter...`);
      try {
        execSync(`tmux send-keys -t ${sessionName} Enter`, { encoding: 'utf-8', timeout: 3000 });
      } catch (e) {
        console.log(`[SPAWN] Failed to dismiss info prompt for ${sessionName}: ${e.message}`);
      }
      continue;
    }

    // If Claude is actively running a task, it's past startup prompts
    if (/esc to interrupt/i.test(recentText)) return true;

    // Check if Claude is showing its input prompt (ready for input)
    const lastLine = lines[lines.length - 1].trim();
    if (/^>\s*$/.test(lastLine) || /^❯\s*$/.test(lastLine) || /^❯\s+\S/.test(lastLine)) {
      return true;
    }

    // Also ready if showing common idle signals
    if (/what.*would.*like/i.test(recentText) || /can i help/i.test(recentText)) {
      return true;
    }
  }

  console.log(`[SPAWN] waitForClaudeReady timed out for ${sessionName} after ${timeoutMs}ms`);
  return false;
}

async function spawnAgent(projectPath, prompt) {
  // Expand ~ to home directory
  if (projectPath.startsWith('~')) {
    projectPath = path.join(os.homedir(), projectPath.slice(1));
  }
  // Resolve to absolute path
  projectPath = path.resolve(projectPath);

  // Use fallback label immediately for fast spawn, then upgrade via LLM async
  const quickLabel = fallbackLabel(prompt);
  const safeName = SPAWN_PREFIX + quickLabel.replace(/[^a-zA-Z0-9_-]/g, '-');

  // Deduplicate if name exists
  let finalName = safeName;
  const allSessions = listTmuxSessions();
  if (allSessions.find(s => s.name === finalName) || registry[finalName]) {
    finalName = safeName + '-' + Date.now().toString(36).slice(-4);
  }

  // Verify project path exists
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  const claudeCmd = 'claude --chrome --dangerously-skip-permissions';
  const tmuxCmd = `tmux new-session -d -s ${finalName} -c "${projectPath}" '${claudeCmd}'`;

  console.log(`[SPAWN] quickLabel=${quickLabel} name=${finalName}`);
  console.log(`[SPAWN] projectPath=${projectPath}`);
  console.log(`[SPAWN] cmd: ${tmuxCmd}`);

  execSync(tmuxCmd, { encoding: 'utf-8', timeout: 10000 });

  // Verify the session started and is in the right directory
  setTimeout(() => {
    const actualPath = getPaneCurrentPath(finalName);
    console.log(`[SPAWN] session ${finalName} actual cwd: ${actualPath}`);
    if (actualPath && actualPath !== projectPath) {
      console.log(`[SPAWN] WARNING: cwd mismatch! expected=${projectPath} actual=${actualPath}`);
    }
  }, 1000);

  registry[finalName] = {
    label: quickLabel,
    projectPath,
    prompt,
    createdAt: Date.now(),
    state: 'running',
    initialPromptSent: false,
  };
  saveRegistry();

  // Async: upgrade label via LLM in background (UI updates via SSE)
  generateSmartLabel(prompt).then(smartLabel => {
    if (smartLabel !== quickLabel && registry[finalName]) {
      console.log(`[SPAWN] label upgraded: "${quickLabel}" → "${smartLabel}"`);
      registry[finalName].label = smartLabel;
      saveRegistry();
    }
  }).catch(e => {
    console.log(`[SPAWN] async label upgrade failed, keeping fallback: ${e.message}`);
  });

  if (prompt) {
    // Wait for Claude to be ready (past trust prompt) before sending
    waitForClaudeReady(finalName).then(ready => {
      if (!ready) {
        console.log(`[SPAWN] Claude not ready for ${finalName}, sending prompt anyway`);
      }
      console.log(`[SPAWN] sending initial prompt to ${finalName}: ${prompt.substring(0, 80)}...`);
      const sent = sendToAgent(finalName, prompt);
      console.log(`[SPAWN] send result: ${sent}`);
      if (registry[finalName]) {
        registry[finalName].initialPromptSent = true;
        saveRegistry();
      }
    });
  }

  return finalName;
}

function sendToAgent(sessionName, message) {
  try {
    const escaped = message.replace(/'/g, "'\\''");
    const keysCmd = `tmux send-keys -t ${sessionName} -l '${escaped}'`;
    console.log(`[SEND] to ${sessionName}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    console.log(`[SEND] keys cmd: ${keysCmd.substring(0, 120)}...`);
    execSync(keysCmd, { encoding: 'utf-8', timeout: 5000 });
    execSync(
      `tmux send-keys -t ${sessionName} Enter`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    console.log(`[SEND] success`);
    return true;
  } catch (e) {
    console.error(`[SEND] FAILED to ${sessionName}:`, e.message);
    return false;
  }
}

function killAgent(sessionName) {
  try {
    execSync(`tmux kill-session -t ${sessionName} 2>/dev/null`, {
      encoding: 'utf-8', timeout: 5000
    });
  } catch {
    // Session might already be dead
  }
  if (registry[sessionName]) {
    registry[sessionName].state = 'completed';
    registry[sessionName].completedAt = Date.now();
    saveRegistry();
  }
}

// ─── State Detection ─────────────────────────────────────────────────────────

function detectAgentState(sessionName, sessionsCache) {
  const reg = registry[sessionName];
  if (!reg) return 'unknown';

  const session = sessionsCache
    ? sessionsCache.find(s => s.name === sessionName)
    : listTmuxSessions().find(s => s.name === sessionName);

  if (!session) return 'completed';

  const pid = getSessionPid(sessionName);
  if (!isProcessAlive(pid)) return 'completed';

  const ageMs = Date.now() - (reg.createdAt || 0);

  // Spawn grace period: treat newly spawned agents as running for 15 seconds
  // This prevents premature idle detection during Claude startup
  if (ageMs < 15000) {
    return 'running';
  }

  // Grace period: if a message was recently sent, treat as running
  // (Claude may not have started producing output yet)
  if (reg.lastMessageSentAt && (Date.now() - reg.lastMessageSentAt) < 10000) {
    return 'running';
  }

  const rawOutput = capturePaneOutput(sessionName, 50);
  const output = stripAnsi(rawOutput);
  const lines = output.split('\n').filter(l => l.trim() !== '');

  if (lines.length === 0) return 'running';

  const recentText = lines.slice(-8).map(l => l.trim()).join('\n');

  // Claude Code's status bar shows "esc to interrupt" only when actively running
  if (/esc to interrupt/i.test(recentText)) {
    return 'running';
  }

  // Filter out persistent UI elements (status bar, separators, empty prompt)
  // to find the actual last content line
  const uiNoise = [
    /bypass permissions/i,
    /shift.?tab to cycle/i,
    /ctrl.?t to hide/i,
    /^[─━═]+$/,
    /^❯\s*$/,
  ];
  const contentLines = lines.filter(l => !uiNoise.some(p => p.test(l.trim())));

  if (contentLines.length === 0) return 'running';

  const lastLine = contentLines[contentLines.length - 1].trim();

  const idlePatterns = [
    /^>\s*$/,
    /^>\s+$/,
    /^\$\s*$/,
    /^❯\s*$/,
    /^❯\s+\S/,                            // Prompt with previous input visible
    /has completed/i,
    /what.*would.*like/i,
    /anything.*else/i,
    /can i help/i,
    /waiting for input/i,
  ];

  if (idlePatterns.some(p => p.test(lastLine))) {
    return 'idle';
  }

  // Check last several content lines for signs Claude is waiting for user input
  // (permission prompts, questions, plan approvals, etc.)
  const recentContent = contentLines.slice(-8).map(l => l.trim()).join('\n');

  const waitingForInputPatterns = [
    /Allow\s+(once|always)/i,              // Permission prompt options
    /do you want to proceed/i,             // Plan/action approval
    /shall I proceed/i,                    // Asking to proceed
    /should I proceed/i,                   // Asking to proceed
    /approve|deny|reject/i,               // Approval prompt
    /yes.*no.*always allow/i,             // Permission choice UI
    /\(y\/n\)/i,                           // y/n prompt
    /enter a value|enter to confirm/i,     // Input prompt
    /select.*option/i,                     // Selection prompt
    /choose.*from/i,                       // Choice prompt
    /press enter to send/i,               // Message input prompt
  ];

  if (waitingForInputPatterns.some(p => p.test(recentContent))) {
    return 'idle';
  }

  return 'running';
}

const NOISE_PATTERNS = [
  /bypass permissions/i,
  /shift.?tab to cycle/i,
  /ctrl.?t to hide/i,
  /press enter to send/i,
  /waiting for input/i,
  /^[>❯$]\s*$/,
  /^\s*$/,
];

function getLastActivity(sessionName) {
  const rawOutput = capturePaneOutput(sessionName, 30);
  const lines = rawOutput.split('\n');

  // Collect last 3 meaningful lines (raw, with ANSI)
  const meaningful = [];
  for (let i = lines.length - 1; i >= 0 && meaningful.length < 3; i--) {
    const clean = stripAnsi(lines[i]).trim();
    if (!clean) continue;
    if (NOISE_PATTERNS.some(p => p.test(clean))) continue;
    meaningful.unshift(lines[i]);
  }
  return meaningful.join('\n');
}

function buildAgentInfo(sessionName, sessionsCache) {
  const reg = registry[sessionName] || {};
  const state = detectAgentState(sessionName, sessionsCache);

  if (registry[sessionName]) {
    // If transitioning to completed, kill the tmux session so it doesn't linger
    if (state === 'completed' && registry[sessionName].state !== 'completed') {
      try {
        execSync(`tmux kill-session -t ${sessionName} 2>/dev/null`, {
          encoding: 'utf-8', timeout: 5000
        });
      } catch {
        // Session might already be dead
      }
      registry[sessionName].completedAt = registry[sessionName].completedAt || Date.now();

      // Send Telegram notification (async, non-blocking)
      const agentInfo = {
        name: sessionName,
        label: registry[sessionName].label || sessionName,
        projectPath: registry[sessionName].projectPath || '',
        prompt: registry[sessionName].prompt || '',
        createdAt: registry[sessionName].createdAt || 0,
        completedAt: registry[sessionName].completedAt,
      };
      setImmediate(() => {
        sendTelegramNotification(agentInfo).catch(err => {
          console.error('[TELEGRAM] Notification failed:', err.message);
        });
      });
    }
    registry[sessionName].state = state;
    if (state === 'idle' && !registry[sessionName].idleSince) {
      registry[sessionName].idleSince = Date.now();

      // Send Telegram notification when transitioning to idle (async, non-blocking)
      const agentInfo = {
        name: sessionName,
        label: registry[sessionName].label || sessionName,
        projectPath: registry[sessionName].projectPath || '',
        prompt: registry[sessionName].prompt || '',
        createdAt: registry[sessionName].createdAt || 0,
        idleSince: registry[sessionName].idleSince,
      };
      setImmediate(() => {
        sendTelegramNotification(agentInfo, null, null, 'idle').catch(err => {
          console.error('[TELEGRAM] Idle notification failed:', err.message);
        });
      });
    } else if (state !== 'idle') {
      delete registry[sessionName].idleSince;
      delete registry[sessionName].lastMessageSentAt;
    }
  }

  return {
    name: sessionName,
    label: reg.label || sessionName,
    projectPath: reg.projectPath || '',
    prompt: reg.prompt || '',
    state,
    createdAt: reg.createdAt || 0,
    idleSince: reg.idleSince || null,
    completedAt: reg.completedAt || null,
    lastActivity: state !== 'completed' ? getLastActivity(sessionName) : '',
    discovered: reg.discovered || false,
  };
}

// ─── Discovery + Aggregation ─────────────────────────────────────────────────

function getAllAgents() {
  const sessions = listTmuxSessions();
  const processTree = buildProcessTree();

  // Discover Claude sessions not yet in registry
  for (const session of sessions) {
    if (registry[session.name]) continue;

    // Check non-Claude cache (re-check every 30s)
    const cached = nonClaudeCache.get(session.name);
    if (cached && Date.now() - cached < 30000) continue;

    const panePid = getSessionPid(session.name);
    if (!panePid) continue;

    if (hasClaudeDescendant(panePid, processTree)) {
      registry[session.name] = {
        label: session.name,
        projectPath: getPaneCurrentPath(session.name),
        prompt: '',
        createdAt: session.created,
        state: 'running',
        discovered: true,
      };
      // Async: generate a smart label from pane output
      refreshDiscoveredLabel(session.name);
    } else {
      nonClaudeCache.set(session.name, Date.now());
    }
  }

  // Mark dead registry entries as completed
  const liveNames = new Set(sessions.map(s => s.name));
  for (const name of Object.keys(registry)) {
    if (!liveNames.has(name) && registry[name].state !== 'completed') {
      registry[name].state = 'completed';
      registry[name].completedAt = registry[name].completedAt || Date.now();
    }
  }

  // Retry label refresh for discovered agents still using session name as label
  for (const name of Object.keys(registry)) {
    const r = registry[name];
    if (r.discovered && r.label === name && !r.labelRefreshed && r.state !== 'completed') {
      refreshDiscoveredLabel(name);
    }
  }

  // Build agent info for all known sessions
  const agents = [];
  for (const name of Object.keys(registry)) {
    agents.push(buildAgentInfo(name, sessions));
  }

  saveRegistry();
  return agents;
}

// ─── Telegram Notification ─────────────────────────────────────────────────────

async function sendTelegramNotification(agent, botToken, chatId, notificationType = 'completed') {
  const token = botToken || telegramConfig.botToken;
  const chat = chatId || telegramConfig.chatId;

  if (!token || !chat || !telegramConfig.enabled) {
    return { success: false, error: 'Telegram not configured' };
  }

  // Calculate duration based on notification type
  const duration = agent.completedAt
    ? Math.round((agent.completedAt - agent.createdAt) / 1000)
    : agent.idleSince
    ? Math.round((agent.idleSince - agent.createdAt) / 1000)
    : 0;

  // Truncate prompt safely and escape any problematic characters
  const safePrompt = (agent.prompt || '').substring(0, 300)
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();

  // Different message format based on notification type
  const message = notificationType === 'idle'
    ? `⏸️ Task Waiting for Input

Task: ${agent.label || 'unknown'}
Project: ${agent.projectPath || 'unknown'}
Duration: ${duration}s

Prompt:
${safePrompt}${agent.prompt.length > 300 ? '...' : ''}`
    : `✅ Task Completed

Task: ${agent.label || 'unknown'}
Project: ${agent.projectPath || 'unknown'}
Duration: ${duration}s

Prompt:
${safePrompt}${agent.prompt.length > 300 ? '...' : ''}`;

  console.log(`[TELEGRAM] Sending ${notificationType} notification, message length:`, message.length);

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      chat_id: chat,
      text: message,
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[TELEGRAM] Notification sent successfully');
          resolve({ success: true });
        } else {
          console.error(`[TELEGRAM] Failed: ${res.statusCode} ${data}`);
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e) => {
      console.error('[TELEGRAM] Request failed:', e.message);
      resolve({ success: false, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

// ─── API Routes ──────────────────────────────────────────────────────────────

app.get('/api/recent-projects', (req, res) => {
  try {
    const seen = new Map(); // path -> most recent createdAt
    for (const agent of Object.values(registry)) {
      if (agent.projectPath) {
        const existing = seen.get(agent.projectPath) || 0;
        const ts = agent.createdAt || 0;
        if (ts > existing) seen.set(agent.projectPath, ts);
      }
    }
    const sorted = [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p);
    res.json(sorted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents', (req, res) => {
  try {
    res.json(getAllAgents());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { projectPath, prompt } = req.body;
    if (!projectPath || !prompt) {
      return res.status(400).json({ error: 'projectPath and prompt are required' });
    }
    const name = await spawnAgent(projectPath, prompt);
    res.json({ name, status: 'spawned' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents/:name/send', (req, res) => {
  try {
    const { name } = req.params;
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const reg = registry[name];
    if (!reg) {
      return res.status(404).json({ error: 'Agent not found in registry' });
    }

    // If agent is completed/dead, re-spawn it in the same project
    if (reg.state === 'completed') {
      const projectPath = reg.projectPath || '.';
      const claudeCmd = 'claude --chrome --dangerously-skip-permissions';

      // Kill any existing tmux session with this name before respawning
      try {
        execSync(`tmux kill-session -t ${name} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 });
        console.log(`[RESPAWN] Killed existing session for ${name}`);
      } catch {
        // Session might not exist, that's fine
        console.log(`[RESPAWN] No existing session to kill for ${name}`);
      }

      // Create new tmux session
      try {
        execSync(
          `tmux new-session -d -s ${name} -c "${projectPath}" '${claudeCmd}'`,
          { encoding: 'utf-8', timeout: 10000 }
        );
        console.log(`[RESPAWN] Created new session for ${name} in ${projectPath}`);
      } catch (spawnError) {
        console.error(`[RESPAWN] Failed to create session for ${name}:`, spawnError.message);
        return res.status(500).json({ error: 'Failed to respawn agent: ' + spawnError.message });
      }

      // Update registry state
      reg.state = 'running';
      reg.prompt = message;
      delete reg.idleSince;
      delete reg.completedAt;
      saveRegistry();

      // Wait for Claude to be ready (past trust prompt) before sending
      waitForClaudeReady(name).then(ready => {
        if (!ready) {
          console.log(`[RESPAWN] Claude not ready for ${name}, sending prompt anyway`);
        }
        sendToAgent(name, message);
      });

      return res.json({ status: 'respawned' });
    }

    // Otherwise send to live session
    const success = sendToAgent(name, message);
    if (success) {
      reg.state = 'running';
      reg.lastMessageSentAt = Date.now();
      delete reg.idleSince;
      saveRegistry();
      res.json({ status: 'sent' });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  } catch (e) {
    console.error('[SEND] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// File upload - save locally and send path to agent
const UPLOAD_DIR = path.join(os.tmpdir(), 'agent-viewer-uploads');

app.post('/api/agents/:name/upload', (req, res) => {
  try {
    const { name } = req.params;

    // Collect raw body chunks
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';

        // Parse multipart boundary
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) {
          return res.status(400).json({ error: 'Invalid multipart form' });
        }
        const boundary = boundaryMatch[1];
        const bodyStr = buf.toString('latin1');

        // Extract filename from Content-Disposition
        const filenameMatch = bodyStr.match(/filename="([^"]+)"/);
        const filename = filenameMatch ? filenameMatch[1] : 'upload-' + Date.now();

        // Extract file content between headers and boundary
        const headerEnd = bodyStr.indexOf('\r\n\r\n');
        const fileStart = headerEnd + 4;
        const fileEnd = bodyStr.lastIndexOf('\r\n--' + boundary);
        const fileBytes = buf.slice(
          Buffer.byteLength(bodyStr.substring(0, fileStart), 'latin1'),
          Buffer.byteLength(bodyStr.substring(0, fileEnd), 'latin1')
        );

        // Save file
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const savePath = path.join(UPLOAD_DIR, `${Date.now()}-${filename}`);
        fs.writeFileSync(savePath, fileBytes);

        // Send file path to agent
        const isImage = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(filename);
        const msg = isImage
          ? `Look at this image and tell me what you see: ${savePath}`
          : `Read this file: ${savePath}`;

        sendToAgent(name, msg);

        if (registry[name]) {
          registry[name].state = 'running';
          delete registry[name].idleSince;
          saveRegistry();
        }

        res.json({ status: 'uploaded', path: savePath });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/agents/:name', (req, res) => {
  try {
    killAgent(req.params.name);
    res.json({ status: 'killed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove a completed agent from the registry (cleanup)
app.delete('/api/agents/:name/cleanup', (req, res) => {
  try {
    const { name } = req.params;
    if (!registry[name]) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    if (registry[name].state !== 'completed') {
      return res.status(400).json({ error: 'Agent is not completed' });
    }
    delete registry[name];
    saveRegistry();
    res.json({ status: 'cleaned' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove all completed agents from the registry
app.delete('/api/cleanup/completed', (req, res) => {
  try {
    let count = 0;
    for (const name of Object.keys(registry)) {
      if (registry[name].state === 'completed') {
        delete registry[name];
        count++;
      }
    }
    saveRegistry();
    res.json({ status: 'cleaned', count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Kill all idle agents
app.delete('/api/kill/idle', (req, res) => {
  try {
    let count = 0;
    for (const name of Object.keys(registry)) {
      if (registry[name].state === 'idle') {
        killAgent(name);
        delete registry[name];
        count++;
      }
    }
    saveRegistry();
    res.json({ status: 'killed', count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents/:name/output', (req, res) => {
  try {
    const raw = capturePaneOutput(req.params.name, 200);
    const clean = stripAnsi(raw);
    res.json({ output: clean, raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Directory Browser ───────────────────────────────────────────────────────

app.get('/api/browse', (req, res) => {
  try {
    const dir = req.query.dir || os.homedir();
    const resolved = path.resolve(dir);

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return res.status(400).json({ error: 'Not a valid directory' });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    res.json({
      current: resolved,
      parent: path.dirname(resolved),
      dirs,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Project Tabs API ─────────────────────────────────────────────────────

app.get('/api/tabs', (req, res) => {
  try {
    res.json(tabsRegistry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

// ─── Telegram Config API ──────────────────────────────────────────────────────

app.get('/api/telegram-config', (req, res) => {
  try {
    // Return config without exposing the full token in logs
    const safeConfig = {
      enabled: telegramConfig.enabled,
      botToken: telegramConfig.botToken ? '***' : '',
      chatId: telegramConfig.chatId,
    };
    res.json(safeConfig);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/telegram-config', (req, res) => {
  try {
    const { botToken, chatId, enabled } = req.body;

    // Only update botToken if explicitly provided (not undefined)
    // Empty string '' means clear the token, undefined means keep existing
    if (botToken !== undefined) {
      telegramConfig.botToken = botToken;
    }
    // If chatId is provided (even empty), update it
    if (chatId !== undefined) {
      telegramConfig.chatId = chatId;
    }
    if (enabled !== undefined) {
      telegramConfig.enabled = enabled;
    }

    saveTelegramConfig();
    res.json({ status: 'saved', config: { enabled: telegramConfig.enabled, chatId: telegramConfig.chatId } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/telegram/test', async (req, res) => {
  try {
    const { botToken, chatId } = req.body;

    // If no credentials provided, use saved config
    const token = botToken || telegramConfig.botToken;
    const chat = chatId || telegramConfig.chatId;

    if (!token || !chat) {
      return res.status(400).json({ error: 'Telegram not configured. Please enter bot token and chat ID.' });
    }

    const result = await sendTelegramNotification({
      label: 'test-task',
      projectPath: process.cwd(),
      prompt: 'This is a test notification from Agent Viewer',
      createdAt: Date.now(),
      completedAt: Date.now(),
    }, token, chat);

    if (result.success) {
      res.json({ status: 'sent' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SSE Endpoint ────────────────────────────────────────────────────────────

const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastAgents() {
  if (sseClients.size === 0) return;
  try {
    const agents = getAllAgents();
    const data = JSON.stringify({ type: 'agents', agents });
    for (const client of sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  } catch (e) {
    console.error('SSE broadcast error:', e.message);
  }
}

// ─── Server Start ────────────────────────────────────────────────────────────

loadRegistry();
loadTabsRegistry();
loadTelegramConfig();

app.listen(PORT, HOST === 'localhost' ? '127.0.0.1' : HOST, () => {
  console.log(`\n  AGENT VIEWER`);
  console.log(`  ════════════════════════════════`);
  console.log(`  Local:   http://localhost:${PORT}`);

  if (HOST === '0.0.0.0') {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`  Network: http://${addr.address}:${PORT}`);
        }
      }
    }
  }

  console.log(`  ════════════════════════════════\n`);
});

setInterval(broadcastAgents, POLL_INTERVAL);
