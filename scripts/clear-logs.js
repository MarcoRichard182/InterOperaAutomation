// scripts/clear-logs.js
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');

// Only clear when env says so
const shouldClear = process.env.CLEAR_LOGS === '1';

function rmSafe(p) {
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

if (shouldClear) {
  rmSafe(path.join(LOG_DIR, 'menu_test_results.csv'));
  rmSafe(path.join(LOG_DIR, 'submenu_test_results.csv'));
  rmSafe(path.join(LOG_DIR, 'upload_test_results.csv'));
  rmSafe(path.join(LOG_DIR, 'wrapper_test_results.csv'));
  rmSafe(path.join(LOG_DIR, 'compliance_test_results.csv'));

  rmSafe(path.join(LOG_DIR, 'summary_menu.txt'));
  rmSafe(path.join(LOG_DIR, 'summary_submenu.txt'));
  rmSafe(path.join(LOG_DIR, 'summary_upload.txt'));
  rmSafe(path.join(LOG_DIR, 'summary_wrapper.txt'));
  rmSafe(path.join(LOG_DIR, 'summary_compliance.txt'));

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  console.log('🧹 Logs cleared.');
} else {
  console.log('🧹 Skipped clearing logs (CLEAR_LOGS != 1).');
}
