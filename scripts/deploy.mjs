import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import https from 'node:https';

const usage = [
  'Usage:',
  '  node ./scripts/deploy.mjs dev',
  '  node ./scripts/deploy.mjs live',
  '  node ./scripts/deploy.mjs pages-dev',
  '  node ./scripts/deploy.mjs pages-prod',
  '',
  'dev  - Push current HEAD to dev/main and deploy the dev worker.',
  'live - Promote dev/main to origin/main and deploy the production worker.',
  'pages-dev  - Build and deploy to the dev Pages branch only.',
  'pages-prod - Build and deploy to the production Pages branch only.',
  '',
  'Required env var for Pages deploys:',
  '  CF_PAGES_PROJECT=<your-pages-project-name>'
].join('\n');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function getOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return (result.stdout || '').trim();
}

function ensureCleanWorktree() {
  const status = getOutput('git', ['status', '--porcelain']);
  if (status) {
    console.error('Refusing to deploy with uncommitted changes. Commit or stash them first.');
    process.exit(1);
  }
}

function ensureRemote(name) {
  const remotes = getOutput('git', ['remote']);
  const remoteList = remotes.split(/\r?\n/).filter(Boolean);
  if (!remoteList.includes(name)) {
    console.error(`Missing git remote: ${name}`);
    process.exit(1);
  }
}

function ensureSecrets(env, required) {
  const output = getOutput('npx', ['--yes', 'wrangler', 'secret', 'list', `--env=${env}`]);
  const missing = required.filter((s) => !output.includes(s));
  if (missing.length > 0) {
    console.error(`\nRefusing to deploy — the following secrets are missing in the ${env || 'default'} environment:\n  ${missing.join('\n  ')}`);
    console.error('Run: npx wrangler secret put <SECRET_NAME>');
    process.exit(1);
  }
}

function smokeTest(url, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== expectedStatus) {
        reject(new Error(`Smoke test failed: ${url} returned ${res.statusCode} (expected ${expectedStatus})`));
      } else {
        console.log(`  ✓ ${url} → ${res.statusCode}`);
        resolve();
      }
      res.resume();
    });
    req.on('error', reject);
    req.on('timeout', () => reject(new Error(`Smoke test timed out: ${url}`)));
  });
}

async function runSmokeTests(baseUrl) {
  console.log(`\nRunning post-deploy smoke tests against ${baseUrl}...`);
  const checks = [
    [baseUrl + '/', 200],
    [baseUrl + '/contact', 200],
    [baseUrl + '/api/health', 200],
    [baseUrl + '/api/validate', 405],
    [baseUrl + '/api/contact', 405]
  ];
  for (const [url, status] of checks) {
    await smokeTest(url, status);
  }
  console.log('All smoke tests passed.\n');
}

function getPagesProjectName() {
  const fromEnv = (process.env.CF_PAGES_PROJECT || '').trim();
  if (fromEnv) return fromEnv;

  try {
    const wranglerConfig = readFileSync('./wrangler.jsonc', 'utf8');
    const nameMatch = wranglerConfig.match(/"name"\s*:\s*"([^"]+)"/);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].trim();
    }
  } catch {
    // Fall through to explicit error message below.
  }

  console.error('Missing Pages project name. Set CF_PAGES_PROJECT or add a top-level "name" in wrangler.jsonc.');
  console.error('Example: $env:CF_PAGES_PROJECT="your-project"; npm run deploy');
  process.exit(1);
}

function deployPages(branch) {
  const project = getPagesProjectName();
  run('npx', ['--yes', 'wrangler', 'pages', 'deploy', './dist', `--project-name=${project}`, `--branch=${branch}`]);
}

const target = (process.argv[2] || '').toLowerCase();

if (!['dev', 'live', 'pages-dev', 'pages-prod'].includes(target)) {
  console.error(usage);
  process.exit(1);
}

if (target === 'live') {
  console.error('Live deploy is disabled. Dev-only mode is enforced.');
  process.exit(1);
}

const DEV_REQUIRED_SECRETS = ['TURNSTILE_SECRET', 'MAILBOXVALIDATOR_API_KEY', 'WEB3FORMS_ACCESS_KEY'];
const PROD_REQUIRED_SECRETS = ['TURNSTILE_SECRET', 'MAILBOXVALIDATOR_API_KEY', 'WEB3FORMS_ACCESS_KEY'];
const DEV_BASE_URL = 'https://outbackwebsitedev.owen-80a.workers.dev';
const PROD_BASE_URL = 'https://theoutback.im';

if (target === 'pages-dev') {
  run('node', ['./scripts/prepare-assets.mjs']);
  deployPages('dev');
  process.exit(0);
}

if (target === 'pages-prod') {
  run('node', ['./scripts/prepare-assets.mjs']);
  deployPages('main');
  process.exit(0);
}

ensureCleanWorktree();
ensureRemote('origin');
ensureRemote('dev');

if (target === 'dev') {
  ensureSecrets('', DEV_REQUIRED_SECRETS);
  run('node', ['./scripts/prepare-assets.mjs']);
  run('git', ['push', 'dev', 'HEAD:main']);
  deployPages('dev');
  await runSmokeTests(DEV_BASE_URL);
  process.exit(0);
}

ensureSecrets('production', PROD_REQUIRED_SECRETS);
run('node', ['./scripts/prepare-assets.mjs']);
run('git', ['fetch', 'dev']);
run('git', ['push', 'origin', 'refs/remotes/dev/main:refs/heads/main']);
deployPages('main');
await runSmokeTests(PROD_BASE_URL);