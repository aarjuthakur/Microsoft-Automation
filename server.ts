import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { chromium } from '@playwright/test';
import { parseFormCsv } from './csv/csvParser';
import { validateFormCsv } from './csv/csvValidator';
import { FormEditorPage } from './builder/FormEditorPage';
import { BROWSER_PROFILE_DIR, TIMEOUTS } from './config/forms.config';

const PORT = 8080;

interface JobStatus {
  jobId: string;
  phase: string;
  message: string;
  formTitle: string | null;
  formResponseUrl: string | null;
  formEditorUrl: string | null;
  totalFields: number;
  timestamp: string;
  formRecordPath: string | null;
}

interface FormRecord {
  formTitle: string;
  csvFile: string;
  editorUrl: string;
  responseUrl: string;
  createdAt: string;
  sections: number;
  questions: number;
  branchRules: number;
}

const GENERATED_FORMS_DIR = join(process.cwd(), 'generated-forms');

function saveFormRecord(status: JobStatus, csvFilename: string, sectionCount: number, branchCount: number): string | null {
  try {
    mkdirSync(GENERATED_FORMS_DIR, { recursive: true });

    const record: FormRecord = {
      formTitle: status.formTitle || 'untitled',
      csvFile: csvFilename + '.csv',
      editorUrl: status.formEditorUrl || '',
      responseUrl: status.formResponseUrl || '',
      createdAt: status.timestamp,
      sections: sectionCount,
      questions: status.totalFields,
      branchRules: branchCount,
    };

    const filename = `${record.formTitle}.json`;
    const filepath = join(GENERATED_FORMS_DIR, filename);
    writeFileSync(filepath, JSON.stringify(record, null, 2), 'utf-8');

    const logPath = join(GENERATED_FORMS_DIR, 'forms-log.json');
    let log: FormRecord[] = [];
    if (existsSync(logPath)) {
      try { log = JSON.parse(readFileSync(logPath, 'utf-8')); } catch { log = []; }
    }
    log.push(record);
    writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8');

    console.log(`Form record saved: ${filepath}`);
    return filepath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to save form record: ${msg}`);
    return null;
  }
}

const jobs = new Map<string, JobStatus>();
let jobCounter = 0;

function createJobStatus(jobId: string): JobStatus {
  return {
    jobId,
    phase: 'queued',
    message: 'Waiting to start...',
    formTitle: null,
    formResponseUrl: null,
    formEditorUrl: null,
    totalFields: 0,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    formRecordPath: null,
  };
}

async function runAutomation(jobId: string, csvPath: string, csvFilename: string): Promise<void> {
  const status = jobs.get(jobId)!;

  try {
    status.phase = 'reading';
    status.message = 'Reading CSV template...';

    const template = parseFormCsv(csvPath);
    const uniqueTitle = `${csvFilename}_${Math.floor(Date.now() / 1000)}`;
    template.title = uniqueTitle;
    status.formTitle = uniqueTitle;
    status.totalFields = template.fields.length;

    status.phase = 'starting_browser';
    status.message = 'Starting Edge browser...';

    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const lf of lockFiles) {
      const lockPath = join(BROWSER_PROFILE_DIR, lf);
      try { if (existsSync(lockPath)) unlinkSync(lockPath); } catch {}
    }

    const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      channel: 'msedge',
      headless: false,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      viewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = context.pages()[0] || await context.newPage();
    const editor = new FormEditorPage(page);

    status.phase = 'waiting_login';
    status.message = 'Waiting for Microsoft login...';

    await editor.navigateAndWaitForLogin();

    const sectionCount = template.branchPlan.orderedSections.length;
    const branchCount = template.branchPlan.branchRules.length;
    status.phase = 'building';
    status.message = `Creating form: ${sectionCount} section(s), ${template.fields.length} question(s), ${branchCount} branch rule(s)...`;

    await editor.createNewForm(template.title);
    await editor.addAllQuestions(template);

    status.formEditorUrl = editor.getEditorUrl();

    status.phase = 'extracting_link';
    status.message = 'Getting response link...';

    const responseUrl = await editor.getResponseUrl();
    status.formResponseUrl = responseUrl;

    status.phase = 'done';
    status.message = 'Form created successfully.';

    const recordPath = saveFormRecord(status, csvFilename, sectionCount, branchCount);
    if (recordPath) status.formRecordPath = recordPath;

    await context.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    status.phase = 'error';
    status.message = `Automation failed: ${msg}`;
    console.error(`Job ${jobId} failed:`, msg);
  }

  try { if (existsSync(csvPath)) unlinkSync(csvPath); } catch {}
}

function parseMultipartFile(body: Buffer, contentType: string): { content: string; filename: string } | null {
  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) return null;

  const boundary = boundaryMatch[1];
  const bodyStr = body.toString('utf-8');
  const parts = bodyStr.split('--' + boundary);

  for (const part of parts) {
    if (part.includes('filename=') && part.includes('Content-Disposition')) {
      const filenameMatch = part.match(/filename="?([^";\r\n]+)"?/);
      const filename = filenameMatch
        ? filenameMatch[1].replace(/\.csv$/i, '').trim()
        : 'Untitled';

      let headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) headerEnd = part.indexOf('\n\n');
      if (headerEnd !== -1) {
        let content = part.substring(headerEnd + 4).trim();
        if (content.endsWith('\r\n')) {
          content = content.slice(0, -2);
        }
        return { content, filename };
      }
    }
  }
  return null;
}

function sendJson(res: ServerResponse, code: number, data: object): void {
  const json = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(json);
}

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(getHtmlPage());
    return;
  }

  if (url.pathname === '/automate' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      sendJson(res, 400, { error: 'Expected multipart/form-data' });
      return;
    }

    const body = await collectBody(req);
    const parsed = parseMultipartFile(body, contentType);

    if (!parsed) {
      sendJson(res, 400, { error: 'No CSV file found in upload' });
      return;
    }

    const tempPath = join(tmpdir(), `form_automation_validate_${Date.now()}.csv`);
    writeFileSync(tempPath, parsed.content, 'utf-8');

    const validation = validateFormCsv(tempPath);
    if (!validation.valid) {
      try { unlinkSync(tempPath); } catch {}
      sendJson(res, 400, { error: 'CSV format errors', validationErrors: validation.errors });
      return;
    }

    const jobId = `job_${++jobCounter}`;
    const status = createJobStatus(jobId);
    jobs.set(jobId, status);

    const jobPath = join(tmpdir(), `form_automation_${jobId}.csv`);
    writeFileSync(jobPath, parsed.content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}

    runAutomation(jobId, jobPath, parsed.filename);

    sendJson(res, 200, { jobId, message: 'Automation started' });
    return;
  }

  if (url.pathname === '/status' && req.method === 'GET') {
    const jobId = url.searchParams.get('id');
    if (!jobId || !jobs.has(jobId)) {
      sendJson(res, 404, { error: 'Job not found' });
      return;
    }
    sendJson(res, 200, jobs.get(jobId)!);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  MS Forms Automation Web UI`);
  console.log(`  Open http://localhost:${PORT} in your browser\n`);
});

function getHtmlPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MS Forms Automation</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; min-height: 100vh; }

  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 32px 0; text-align: center; }
  .header h1 { font-size: 26px; font-weight: 600; }
  .header p { color: #8899aa; margin-top: 6px; font-size: 14px; }

  .container { max-width: 720px; margin: -32px auto 40px; padding: 0 20px; position: relative; }

  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 32px; margin-bottom: 24px; }

  .upload-zone { border: 2px dashed #c0c8d4; border-radius: 10px; padding: 48px 24px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .upload-zone:hover, .upload-zone.dragover { border-color: #4a6cf7; background: #f5f7ff; }
  .upload-zone svg { width: 48px; height: 48px; fill: #8899aa; margin-bottom: 12px; }
  .upload-zone.dragover svg { fill: #4a6cf7; }
  .upload-zone p { color: #555; font-size: 15px; }
  .upload-zone .hint { color: #999; font-size: 13px; margin-top: 6px; }
  .file-input { display: none; }

  .file-name { margin-top: 12px; padding: 10px 16px; background: #f0f2f5; border-radius: 8px; display: none; align-items: center; gap: 10px; font-size: 14px; color: #333; }
  .file-name.visible { display: flex; }
  .file-name .remove { cursor: pointer; color: #c62828; font-weight: 600; margin-left: auto; }

  .btn { display: inline-block; padding: 12px 32px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-primary { background: #4a6cf7; color: #fff; }
  .btn-primary:hover { background: #3b5de7; }
  .btn-primary:disabled { background: #b0bec5; cursor: not-allowed; }
  .btn-row { margin-top: 20px; text-align: center; }

  .progress-section { display: none; }
  .progress-section.visible { display: block; }

  .progress-bar-track { background: #e0e0e0; border-radius: 6px; height: 8px; overflow: hidden; margin: 16px 0; }
  .progress-bar-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #4a6cf7, #6c8cff); transition: width 0.5s ease; }

  .status-msg { font-size: 14px; color: #555; min-height: 20px; }
  .phase-label { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .phase-label.reading { background: #e3f2fd; color: #1565c0; }
  .phase-label.starting_browser { background: #fff3e0; color: #e65100; }
  .phase-label.waiting_login { background: #fce4ec; color: #c62828; }
  .phase-label.building { background: #e8eaf6; color: #283593; }
  .phase-label.extracting_link { background: #e3f2fd; color: #1565c0; }
  .phase-label.done { background: #e8f5e9; color: #2e7d32; }
  .phase-label.error { background: #ffebee; color: #c62828; }

  .results-section { display: none; }
  .results-section.visible { display: block; }

  .link-box { margin-top: 16px; padding: 14px 18px; background: #f5f7ff; border: 1px solid #dde3f0; border-radius: 8px; }
  .link-box label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
  .link-box a { color: #4a6cf7; word-break: break-all; font-size: 14px; }
  .link-box .copy-btn { float: right; background: none; border: 1px solid #4a6cf7; color: #4a6cf7; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .link-box .copy-btn:hover { background: #4a6cf7; color: #fff; }

  .reset-btn { margin-top: 16px; }

  .error-list { margin-top: 16px; display: none; }
  .error-list.visible { display: block; }
  .error-list h4 { color: #c62828; font-size: 14px; margin-bottom: 8px; }
  .error-list ul { list-style: none; padding: 0; }
  .error-list li { padding: 8px 12px; margin-bottom: 4px; background: #ffebee; border-left: 3px solid #c62828; border-radius: 4px; font-size: 13px; color: #333; }
  .error-list li .row-num { color: #c62828; font-weight: 600; margin-right: 4px; }

  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ddd; border-top-color: #4a6cf7; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<div class="header">
  <h1>MS Forms Automation</h1>
  <p>Upload a CSV template to auto-create a Microsoft Form</p>
</div>

<div class="container">

  <div class="card" id="uploadCard">
    <div class="upload-zone" id="dropZone" onclick="document.getElementById('csvFile').click()">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/><path d="M8 14h8v2H8zm0-3h8v2H8z"/></svg>
      <p>Drop your CSV file here or click to browse</p>
      <div class="hint">Accepts .csv files with columns: Form Type, Validation, Question, Required, Options, Branch</div>
    </div>
    <input type="file" id="csvFile" class="file-input" accept=".csv">
    <div class="file-name" id="fileName">
      <span id="fileNameText"></span>
      <span class="remove" onclick="clearFile()">X</span>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="startBtn" disabled onclick="startAutomation()">Create Form</button>
    </div>
    <div class="error-list" id="errorList">
      <h4>CSV Format Errors</h4>
      <ul id="errorItems"></ul>
    </div>
  </div>

  <div class="card progress-section" id="progressSection">
    <span class="phase-label" id="phaseLabel">Starting</span>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" id="progressBar" style="width: 0%"></div>
    </div>
    <div class="status-msg" id="statusMsg"><span class="spinner"></span> Initializing...</div>
  </div>

  <div class="card results-section" id="resultsSection">
    <h3 style="margin-bottom: 4px;">Form Created</h3>
    <p style="font-size:13px; color:#888;" id="formTitleDisplay"></p>

    <div class="link-box" id="editorLinkBox" style="display:none;">
      <label>Form Editor Link</label>
      <button class="copy-btn" onclick="copyEditorLink()">Copy</button>
      <a id="editorLink" href="#" target="_blank"></a>
    </div>

    <div class="link-box" id="formLinkBox" style="display:none;">
      <label>Form Response Link</label>
      <button class="copy-btn" onclick="copyLink()">Copy</button>
      <a id="formLink" href="#" target="_blank"></a>
    </div>

    <div class="link-box" id="recordPathBox" style="display:none;">
      <label>Form Record Saved</label>
      <span id="recordPath" style="font-size:13px; color:#555;"></span>
    </div>

    <div class="btn-row reset-btn">
      <button class="btn btn-primary" style="background:#78909c;" onclick="resetPage()">Create Another Form</button>
    </div>
  </div>

</div>

<script>
  let selectedFile = null;
  let currentJobId = null;
  let pollInterval = null;

  const dropZone = document.getElementById('dropZone');
  const csvInput = document.getElementById('csvFile');

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  csvInput.addEventListener('change', () => { if (csvInput.files.length) handleFile(csvInput.files[0]); });

  function handleFile(file) {
    if (!file.name.endsWith('.csv')) { alert('Please select a .csv file'); return; }
    selectedFile = file;
    document.getElementById('fileNameText').textContent = file.name;
    document.getElementById('fileName').classList.add('visible');
    document.getElementById('startBtn').disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    csvInput.value = '';
    document.getElementById('fileName').classList.remove('visible');
    document.getElementById('startBtn').disabled = true;
    document.getElementById('errorList').classList.remove('visible');
  }

  async function startAutomation() {
    if (!selectedFile) return;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('errorList').classList.remove('visible');
    document.getElementById('progressSection').classList.add('visible');
    document.getElementById('resultsSection').classList.remove('visible');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/automate', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.validationErrors) {
        showValidationErrors(data.validationErrors);
        document.getElementById('progressSection').classList.remove('visible');
        document.getElementById('startBtn').disabled = false;
        return;
      }

      if (data.error) { showError(data.error); return; }
      currentJobId = data.jobId;
      pollInterval = setInterval(pollStatus, 2000);
    } catch (err) {
      showError('Failed to start automation: ' + err.message);
    }
  }

  function showValidationErrors(errors) {
    const list = document.getElementById('errorItems');
    list.innerHTML = '';
    errors.forEach(function(e) {
      const li = document.createElement('li');
      if (e.row) li.innerHTML = '<span class="row-num">Row ' + e.row + ':</span> ' + e.message;
      else li.textContent = e.message;
      list.appendChild(li);
    });
    document.getElementById('errorList').classList.add('visible');
  }

  async function pollStatus() {
    if (!currentJobId) return;
    try {
      const res = await fetch('/status?id=' + currentJobId);
      const s = await res.json();
      updateProgress(s);
      if (s.phase === 'done' || s.phase === 'error') {
        clearInterval(pollInterval);
        if (s.phase === 'done') showResults(s);
      }
    } catch (err) { /* retry on next poll */ }
  }

  function updateProgress(s) {
    const phases = { queued: 5, reading: 10, starting_browser: 20, waiting_login: 30, building: 50, extracting_link: 80, done: 100, error: 100 };
    const pct = phases[s.phase] || 50;
    document.getElementById('progressBar').style.width = pct + '%';
    const label = document.getElementById('phaseLabel');
    label.textContent = s.phase.replace(/_/g, ' ');
    label.className = 'phase-label ' + s.phase;
    const msg = s.phase === 'done' || s.phase === 'error' ? s.message : '<span class="spinner"></span> ' + s.message;
    document.getElementById('statusMsg').innerHTML = msg;
  }

  function showResults(s) {
    document.getElementById('progressSection').classList.remove('visible');
    document.getElementById('resultsSection').classList.add('visible');
    if (s.formTitle) document.getElementById('formTitleDisplay').textContent = s.formTitle;
    if (s.formEditorUrl) {
      document.getElementById('editorLinkBox').style.display = 'block';
      const ea = document.getElementById('editorLink');
      ea.href = s.formEditorUrl;
      ea.textContent = s.formEditorUrl;
    }
    if (s.formResponseUrl) {
      document.getElementById('formLinkBox').style.display = 'block';
      const a = document.getElementById('formLink');
      a.href = s.formResponseUrl;
      a.textContent = s.formResponseUrl;
    }
    if (s.formRecordPath) {
      document.getElementById('recordPathBox').style.display = 'block';
      document.getElementById('recordPath').textContent = s.formRecordPath;
    }
  }

  function showError(msg) {
    document.getElementById('statusMsg').innerHTML = '<span style="color:#c62828">' + msg + '</span>';
    document.getElementById('startBtn').disabled = false;
  }

  function copyLink() {
    const url = document.getElementById('formLink').textContent;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('formLinkBox').querySelector('.copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    });
  }

  function copyEditorLink() {
    const url = document.getElementById('editorLink').textContent;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('editorLinkBox').querySelector('.copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    });
  }

  function resetPage() {
    clearFile();
    currentJobId = null;
    document.getElementById('progressSection').classList.remove('visible');
    document.getElementById('resultsSection').classList.remove('visible');
    document.getElementById('errorList').classList.remove('visible');
    document.getElementById('editorLinkBox').style.display = 'none';
    document.getElementById('formLinkBox').style.display = 'none';
    document.getElementById('recordPathBox').style.display = 'none';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('progressBar').style.width = '0%';
  }
</script>
</body>
</html>`;
}
