#!/bin/bash
set -e

# Script to fetch the last 10 test reports from GitHub Actions artifacts
# and organize them in the docs/static/test-reports directory

REPO_OWNER="${GITHUB_REPOSITORY_OWNER}"
REPO_NAME="${GITHUB_REPOSITORY##*/}"
TOKEN="${GITHUB_TOKEN}"
REPORTS_DIR="docs/static/test-reports"

echo "Fetching recent workflow runs for repository: ${REPO_OWNER}/${REPO_NAME}"

# Clean up old reports directory
rm -rf "${REPORTS_DIR}"
mkdir -p "${REPORTS_DIR}"

# Fetch the last 30 completed workflow runs from all branches
# We fetch more than 10 to ensure we get 10 with actual Playwright reports
WORKFLOW_RUNS=$(curl -s -H "Authorization: token ${TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?status=completed&per_page=30")

# Extract run IDs, numbers, created dates, branch names, and conclusion
RUN_DATA=$(echo "${WORKFLOW_RUNS}" | jq -r '.workflow_runs[] | select(.name == "CI and Deploy Docs" or .name == "CI") | "\(.id)|\(.run_number)|\(.created_at)|\(.conclusion)|\(.head_branch)"')

echo "Found workflow runs:"
echo "${RUN_DATA}"

# Check if we found any runs
if [ -z "${RUN_DATA}" ]; then
  echo "No CI workflow runs found. Creating placeholder."
  echo "<html><body><h1>No Test Reports Available</h1><p>Reports will appear here after tests run.</p></body></html>" > "${REPORTS_DIR}/index.html"
  exit 0
fi

# Process each run to find those with playwright-report artifacts
REPORT_COUNT=0
while IFS='|' read -r RUN_ID RUN_NUMBER CREATED_AT CONCLUSION BRANCH; do
  if [ ${REPORT_COUNT} -ge 10 ]; then
    break
  fi
  
  echo "Checking run ${RUN_NUMBER} (ID: ${RUN_ID}, Branch: ${BRANCH})..."
  
  # Get artifacts for this run
  ARTIFACTS=$(curl -s -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${RUN_ID}/artifacts")
  
  # Look for playwright-report artifact (with or without run number)
  ARTIFACT_URL=$(echo "${ARTIFACTS}" | jq -r '.artifacts[] | select(.name | startswith("playwright-report")) | .archive_download_url' | head -1)
  
  if [ -n "${ARTIFACT_URL}" ] && [ "${ARTIFACT_URL}" != "null" ]; then
    echo "Found Playwright report for run ${RUN_NUMBER}"
    
    # Create directory for this report
    REPORT_DIR="${REPORTS_DIR}/run-${RUN_NUMBER}"
    mkdir -p "${REPORT_DIR}"
    
    # Download the playwright report artifact
    TEMP_ZIP="/tmp/playwright-report-${RUN_NUMBER}.zip"
    curl -L -H "Authorization: token ${TOKEN}" \
      -H "Accept: application/vnd.github.v3+json" \
      "${ARTIFACT_URL}" -o "${TEMP_ZIP}"
    
    # Extract the artifact
    unzip -q "${TEMP_ZIP}" -d "${REPORT_DIR}"
    rm "${TEMP_ZIP}"
    
    # Store metadata
    echo "${CREATED_AT}" > "${REPORT_DIR}/timestamp.txt"
    echo "${CONCLUSION}" > "${REPORT_DIR}/conclusion.txt"
    echo "${RUN_NUMBER}" > "${REPORT_DIR}/run-number.txt"
    echo "${BRANCH}" > "${REPORT_DIR}/branch.txt"
    echo "${RUN_ID}" > "${REPORT_DIR}/run-id.txt"
    
    # Download backend test results
    BACKEND_ARTIFACT_URL=$(echo "${ARTIFACTS}" | jq -r '.artifacts[] | select(.name | startswith("backend-test-results")) | .archive_download_url' | head -1)
    if [ -n "${BACKEND_ARTIFACT_URL}" ] && [ "${BACKEND_ARTIFACT_URL}" != "null" ]; then
      echo "Found backend test results for run ${RUN_NUMBER}"
      TEMP_ZIP="/tmp/backend-results-${RUN_NUMBER}.zip"
      curl -L -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        "${BACKEND_ARTIFACT_URL}" -o "${TEMP_ZIP}"
      unzip -q "${TEMP_ZIP}" -d "${REPORT_DIR}"
      rm "${TEMP_ZIP}"
    else
      echo '{"total": 0, "passed": 0, "failed": 0, "framework": ".NET 9.0", "failures": [], "notAvailable": true}' > "${REPORT_DIR}/backend-results.json"
    fi
    
    # Download frontend test results
    FRONTEND_ARTIFACT_URL=$(echo "${ARTIFACTS}" | jq -r '.artifacts[] | select(.name | startswith("frontend-test-results")) | .archive_download_url' | head -1)
    if [ -n "${FRONTEND_ARTIFACT_URL}" ] && [ "${FRONTEND_ARTIFACT_URL}" != "null" ]; then
      echo "Found frontend test results for run ${RUN_NUMBER}"
      TEMP_ZIP="/tmp/frontend-results-${RUN_NUMBER}.zip"
      curl -L -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        "${FRONTEND_ARTIFACT_URL}" -o "${TEMP_ZIP}"
      unzip -q "${TEMP_ZIP}" -d "${REPORT_DIR}"
      rm "${TEMP_ZIP}"
    else
      echo '{"total": 0, "passed": 0, "failed": 0, "framework": "Jest", "failures": [], "notAvailable": true}' > "${REPORT_DIR}/frontend-results.json"
    fi
    
    # Download blender test results
    BLENDER_ARTIFACT_URL=$(echo "${ARTIFACTS}" | jq -r '.artifacts[] | select(.name | startswith("blender-test-results")) | .archive_download_url' | head -1)
    if [ -n "${BLENDER_ARTIFACT_URL}" ] && [ "${BLENDER_ARTIFACT_URL}" != "null" ]; then
      echo "Found blender test results for run ${RUN_NUMBER}"
      TEMP_ZIP="/tmp/blender-results-${RUN_NUMBER}.zip"
      curl -L -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        "${BLENDER_ARTIFACT_URL}" -o "${TEMP_ZIP}"
      unzip -q "${TEMP_ZIP}" -d "${REPORT_DIR}"
      rm "${TEMP_ZIP}"
    else
      echo '{"total": 0, "passed": 0, "failed": 0, "framework": "pytest", "failures": [], "notAvailable": true}' > "${REPORT_DIR}/blender-results.json"
    fi
    
    REPORT_COUNT=$((REPORT_COUNT + 1))
    echo "Downloaded report ${REPORT_COUNT}/10"
  else
    echo "No Playwright report found for run ${RUN_NUMBER}"
  fi
done <<< "${RUN_DATA}"

if [ ${REPORT_COUNT} -eq 0 ]; then
  echo "No Playwright reports found. Creating placeholder."
  echo "<html><body><h1>No Test Reports Available</h1><p>Reports will appear here after tests run.</p></body></html>" > "${REPORTS_DIR}/index.html"
  exit 0
fi

echo "Downloaded ${REPORT_COUNT} test reports"

# Sort directories by timestamp (newest first) and store sorted list
SORT_TMP=$(mktemp)
for DIR in "${REPORTS_DIR}"/run-*; do
  if [ -d "${DIR}" ]; then
    TIMESTAMP=$(cat "${DIR}/timestamp.txt" 2>/dev/null || echo "1970-01-01T00:00:00Z")
    echo "${TIMESTAMP}|${DIR}"
  fi
done | sort -t'|' -k1 -r > "${SORT_TMP}"

# Generate an index page with dark mode design
cat > "${REPORTS_DIR}/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Reports - Modelibr</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0d1117;
      min-height: 100vh;
      padding: 2rem;
      color: #e6edf3;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      color: #e6edf3;
      text-align: center;
      margin-bottom: 0.5rem;
      font-size: 2rem;
      font-weight: 600;
    }
    .subtitle {
      text-align: center;
      color: #8b949e;
      margin-bottom: 2rem;
      font-size: 1rem;
    }
    .info-banner {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .info-banner-text {
      flex: 1;
      min-width: 250px;
    }
    .info-banner-title {
      font-size: 1rem;
      font-weight: 600;
      color: #58a6ff;
      margin-bottom: 0.25rem;
    }
    .info-banner-desc {
      font-size: 0.875rem;
      color: #8b949e;
    }
    .info-banner-link {
      padding: 0.5rem 1rem;
      background: #238636;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .info-banner-link:hover {
      background: #2ea043;
    }
    .report-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: #21262d;
      border-bottom: 1px solid #30363d;
    }
    .report-header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .run-number {
      font-size: 1.25rem;
      font-weight: 600;
      color: #58a6ff;
    }
    .branch-badge {
      padding: 0.25rem 0.5rem;
      background: #30363d;
      color: #8b949e;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
    }
    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-success {
      background: rgba(35, 134, 54, 0.2);
      color: #3fb950;
    }
    .status-failure {
      background: rgba(248, 81, 73, 0.2);
      color: #f85149;
    }
    .report-meta {
      padding: 1rem 1.5rem;
      display: flex;
      gap: 2rem;
      font-size: 0.875rem;
      color: #8b949e;
      border-bottom: 1px solid #30363d;
    }
    .meta-item {
      display: flex;
      gap: 0.5rem;
    }
    .meta-label {
      color: #8b949e;
    }
    .meta-value {
      color: #e6edf3;
    }
    .meta-link {
      color: #58a6ff;
      text-decoration: none;
    }
    .meta-link:hover {
      text-decoration: underline;
    }
    .test-sections {
      padding: 1rem 1.5rem;
    }
    .test-section {
      margin-bottom: 0.75rem;
      border: 1px solid #30363d;
      border-radius: 6px;
      overflow: hidden;
    }
    .test-section:last-child {
      margin-bottom: 0;
    }
    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #21262d;
      cursor: pointer;
      user-select: none;
    }
    .test-header:hover {
      background: #30363d;
    }
    .test-header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .test-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #e6edf3;
    }
    .test-framework {
      font-size: 0.75rem;
      color: #8b949e;
    }
    .test-stats {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
    }
    .stat-passed {
      color: #3fb950;
    }
    .stat-failed {
      color: #f85149;
    }
    .stat-total {
      color: #8b949e;
    }
    .expand-icon {
      color: #8b949e;
      transition: transform 0.2s;
    }
    .test-section.expanded .expand-icon {
      transform: rotate(180deg);
    }
    .test-failures {
      display: none;
      padding: 0;
      background: #0d1117;
      border-top: 1px solid #30363d;
    }
    .test-section.expanded .test-failures {
      display: block;
    }
    .failure-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #21262d;
    }
    .failure-item:last-child {
      border-bottom: none;
    }
    .failure-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #f85149;
      font-family: monospace;
      margin-bottom: 0.5rem;
      word-break: break-all;
    }
    .failure-message {
      font-size: 0.75rem;
      color: #8b949e;
      font-family: monospace;
      white-space: pre-wrap;
      word-break: break-word;
      background: #161b22;
      padding: 0.5rem;
      border-radius: 4px;
    }
    .no-failures {
      padding: 0.75rem 1rem;
      color: #3fb950;
      font-size: 0.875rem;
    }
    .not-available {
      padding: 0.75rem 1rem;
      color: #8b949e;
      font-size: 0.875rem;
      font-style: italic;
    }
    .report-actions {
      padding: 1rem 1.5rem;
      background: #21262d;
      border-top: 1px solid #30363d;
    }
    .view-button {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: #238636;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .view-button:hover {
      background: #2ea043;
    }
    .no-reports {
      background: #161b22;
      border: 1px solid #30363d;
      padding: 3rem;
      border-radius: 8px;
      text-align: center;
    }
    .no-reports h2 {
      color: #58a6ff;
      margin-bottom: 1rem;
    }
    .no-reports p {
      color: #8b949e;
    }
    @media (max-width: 640px) {
      body {
        padding: 1rem;
      }
      h1 {
        font-size: 1.5rem;
      }
      .report-meta {
        flex-direction: column;
        gap: 0.5rem;
      }
      .info-banner {
        flex-direction: column;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Reports</h1>
    <p class="subtitle">Latest Test Results for Modelibr (Last 10 Runs)</p>

    <div class="info-banner">
      <div class="info-banner-text">
        <div class="info-banner-title">Test Reports Archive</div>
        <div class="info-banner-desc">E2E, backend, frontend, and Blender addon test results</div>
      </div>
      <a href="#" id="workflow-link" class="info-banner-link" target="_blank">
        View All Workflows
      </a>
    </div>

    <div id="reports-container">
      <!-- Reports will be inserted here -->
    </div>
  </div>
  <script>
    // Repository information
    const REPO_OWNER = 'PLACEHOLDER_REPO_OWNER';
    const REPO_NAME = 'PLACEHOLDER_REPO_NAME';

    // This will be populated by the bash script
    const reports = [
EOF

# Replace placeholders with actual values
sed -i "s/PLACEHOLDER_REPO_OWNER/${REPO_OWNER}/g" "${REPORTS_DIR}/index.html"
sed -i "s/PLACEHOLDER_REPO_NAME/${REPO_NAME}/g" "${REPORTS_DIR}/index.html"

# Add report data to JavaScript array (using sorted list)
FIRST=true
while IFS='|' read -r _ DIR; do
  if [ -d "${DIR}" ]; then
    RUN_NUM=$(cat "${DIR}/run-number.txt")
    RUN_ID=$(cat "${DIR}/run-id.txt" 2>/dev/null || echo "")
    TIMESTAMP=$(cat "${DIR}/timestamp.txt")
    CONCLUSION=$(cat "${DIR}/conclusion.txt")
    BRANCH=$(cat "${DIR}/branch.txt" 2>/dev/null || echo "unknown")

    # Read test results JSON files
    BACKEND_RESULTS=$(cat "${DIR}/backend-results.json" 2>/dev/null || echo '{"total":0,"passed":0,"failed":0,"failures":[],"notAvailable":true}')
    FRONTEND_RESULTS=$(cat "${DIR}/frontend-results.json" 2>/dev/null || echo '{"total":0,"passed":0,"failed":0,"failures":[],"notAvailable":true}')
    BLENDER_RESULTS=$(cat "${DIR}/blender-results.json" 2>/dev/null || echo '{"total":0,"passed":0,"failed":0,"failures":[],"notAvailable":true}')

    # Convert timestamp to readable format using JavaScript
    if [ "${FIRST}" = true ]; then
      FIRST=false
    else
      echo "," >> "${REPORTS_DIR}/index.html"
    fi

    cat >> "${REPORTS_DIR}/index.html" << REPORT_EOF
      {
        runNumber: ${RUN_NUM},
        runId: '${RUN_ID}',
        timestamp: '${TIMESTAMP}',
        conclusion: '${CONCLUSION}',
        branch: '${BRANCH}',
        path: 'run-${RUN_NUM}/index.html',
        backendTests: ${BACKEND_RESULTS},
        frontendTests: ${FRONTEND_RESULTS},
        blenderTests: ${BLENDER_RESULTS}
      }
REPORT_EOF
  fi
done < "${SORT_TMP}"
rm -f "${SORT_TMP}"

# Complete the HTML
cat >> "${REPORTS_DIR}/index.html" << 'EOF'
    ];

    const container = document.getElementById('reports-container');
    
    function renderTestSection(id, name, framework, results) {
      const hasFailures = results.failures && results.failures.length > 0;
      const isNotAvailable = results.notAvailable || (results.total === 0 && results.error);
      
      if (isNotAvailable) {
        return `
          <div class="test-section" id="${id}">
            <div class="test-header">
              <div class="test-header-left">
                <span class="test-name">${name}</span>
                <span class="test-framework">${framework}</span>
              </div>
              <span class="stat-total">Not available</span>
            </div>
          </div>
        `;
      }
      
      const failuresHtml = hasFailures 
        ? results.failures.map(f => `
            <div class="failure-item">
              <div class="failure-name">${escapeHtml(f.name)}</div>
              <div class="failure-message">${escapeHtml(f.message || 'No error message')}</div>
            </div>
          `).join('')
        : (results.failed > 0 
            ? '<div class="not-available">Failure details not captured</div>'
            : '<div class="no-failures">All tests passed</div>');
      
      return `
        <div class="test-section" id="${id}">
          <div class="test-header" onclick="toggleSection('${id}')">
            <div class="test-header-left">
              <span class="test-name">${name}</span>
              <span class="test-framework">${framework}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div class="test-stats">
                <span class="stat-passed">✓ ${results.passed}</span>
                <span class="stat-failed">✗ ${results.failed}</span>
                <span class="stat-total">${results.total} total</span>
              </div>
              <span class="expand-icon">▼</span>
            </div>
          </div>
          <div class="test-failures">
            ${failuresHtml}
          </div>
        </div>
      `;
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    }
    
    function toggleSection(id) {
      const section = document.getElementById(id);
      if (section) {
        section.classList.toggle('expanded');
      }
    }

    // Set the workflow link URL dynamically
    const workflowLink = document.getElementById('workflow-link');
    if (workflowLink && REPO_OWNER && REPO_NAME) {
      workflowLink.href = `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions`;
    }

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="no-reports">
          <h2>No Reports Available Yet</h2>
          <p>Test reports will appear here after tests have run successfully.</p>
          <p>Check back after the next CI pipeline completes.</p>
        </div>
      `;
    } else {
      reports.forEach((report, index) => {
        const date = new Date(report.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
        const formattedTime = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        const statusClass = report.conclusion === 'success' ? 'status-success' : 'status-failure';
        const statusText = report.conclusion === 'success' ? 'Passed' : 'Failed';
        
        const card = document.createElement('div');
        card.className = 'report-card';
        card.innerHTML = `
          <div class="report-header">
            <div class="report-header-left">
              <span class="run-number">Run #${report.runNumber}</span>
              <span class="branch-badge">${report.branch || 'unknown'}</span>
            </div>
            <span class="status-badge ${statusClass}">${statusText}</span>
          </div>
          <div class="report-meta">
            <div class="meta-item">
              <span class="meta-label">Date:</span>
              <span class="meta-value">${formattedDate} at ${formattedTime}</span>
            </div>
            ${report.runId ? `
            <div class="meta-item">
              <a href="https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/runs/${report.runId}" target="_blank" class="meta-link">View on GitHub</a>
            </div>
            ` : ''}
          </div>
          <div class="test-sections">
            ${renderTestSection('backend-' + index, 'Backend', '.NET', report.backendTests)}
            ${renderTestSection('frontend-' + index, 'Frontend', 'Jest', report.frontendTests)}
            ${renderTestSection('blender-' + index, 'Blender Addon', 'pytest', report.blenderTests)}
          </div>
          <div class="report-actions">
            <a href="${report.path}" class="view-button">View E2E Report</a>
          </div>
        `;
        container.appendChild(card);
      });
    }
  </script>
</body>
</html>
EOF

echo "Index page generated at ${REPORTS_DIR}/index.html"
echo "Successfully organized ${REPORT_COUNT} test reports"
