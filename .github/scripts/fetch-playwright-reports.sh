#!/bin/bash
set -e

# Script to fetch the last 10 Playwright reports from GitHub Actions artifacts
# and organize them in the docs/static/playwright-reports directory

REPO_OWNER="${GITHUB_REPOSITORY_OWNER}"
REPO_NAME="${GITHUB_REPOSITORY##*/}"
TOKEN="${GITHUB_TOKEN}"
REPORTS_DIR="docs/static/playwright-reports"

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
  echo "<html><body><h1>No Playwright Reports Available</h1><p>Reports will appear here after E2E tests run.</p></body></html>" > "${REPORTS_DIR}/index.html"
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
      echo '{"total": 0, "passed": 0, "failed": 0, "framework": ".NET 9.0", "error": "Not available"}' > "${REPORT_DIR}/backend-results.json"
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
      echo '{"total": 0, "passed": 0, "failed": 0, "framework": "Jest", "error": "Not available"}' > "${REPORT_DIR}/frontend-results.json"
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
      echo '{"total": 0, "passed": 0, "failed": 0, "framework": "pytest", "error": "Not available"}' > "${REPORT_DIR}/blender-results.json"
    fi
    
    REPORT_COUNT=$((REPORT_COUNT + 1))
    echo "Downloaded report ${REPORT_COUNT}/10"
  else
    echo "No Playwright report found for run ${RUN_NUMBER}"
  fi
done <<< "${RUN_DATA}"

if [ ${REPORT_COUNT} -eq 0 ]; then
  echo "No Playwright reports found. Creating placeholder."
  echo "<html><body><h1>No Playwright Reports Available</h1><p>Reports will appear here after E2E tests run.</p></body></html>" > "${REPORTS_DIR}/index.html"
  exit 0
fi

echo "Downloaded ${REPORT_COUNT} Playwright reports"

# Generate an index page
cat > "${REPORTS_DIR}/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playwright Test Reports - Modelibr</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 0.5rem;
      font-size: 2.5rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .subtitle {
      text-align: center;
      color: rgba(255,255,255,0.9);
      margin-bottom: 2rem;
      font-size: 1.1rem;
    }
    .reports-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
    }
    .report-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      display: flex;
      flex-direction: column;
    }
    .report-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 40px rgba(0,0,0,0.3);
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #f0f0f0;
    }
    .run-number {
      font-size: 1.5rem;
      font-weight: bold;
      color: #667eea;
    }
    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-success {
      background: #d4edda;
      color: #155724;
    }
    .status-failure {
      background: #f8d7da;
      color: #721c24;
    }
    .branch-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      background: #e9ecef;
      color: #495057;
      border-radius: 4px;
      font-size: 0.8rem;
      font-family: monospace;
      margin-top: 0.5rem;
    }
    .report-info {
      margin-bottom: 1rem;
      flex-grow: 1;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      font-size: 0.9rem;
      color: #666;
    }
    .info-label {
      font-weight: 600;
      color: #444;
    }
    .test-results {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
    }
    .test-results-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: #495057;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .test-section {
      margin-bottom: 0.75rem;
      padding: 0.5rem;
      background: white;
      border-radius: 4px;
      border-left: 3px solid #667eea;
    }
    .test-section:last-child {
      margin-bottom: 0;
    }
    .test-name {
      font-size: 0.75rem;
      font-weight: 600;
      color: #667eea;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 0.25rem;
    }
    .test-stats {
      display: flex;
      gap: 0.75rem;
      font-size: 0.8rem;
    }
    .test-stat {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .test-stat-passed {
      color: #28a745;
      font-weight: 600;
    }
    .test-stat-failed {
      color: #dc3545;
      font-weight: 600;
    }
    .test-stat-total {
      color: #6c757d;
      font-weight: 600;
    }
    .view-button {
      display: inline-block;
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      text-align: center;
      border-radius: 8px;
      font-weight: 600;
      transition: opacity 0.3s ease;
      margin-top: auto;
    }
    .view-button:hover {
      opacity: 0.9;
    }
    .no-reports {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .no-reports h2 {
      color: #667eea;
      margin-bottom: 1rem;
    }
    .no-reports p {
      color: #666;
      line-height: 1.6;
    }
    @media (max-width: 640px) {
      body {
        padding: 1rem;
      }
      h1 {
        font-size: 2rem;
      }
      .reports-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎭 Playwright Test Reports</h1>
    <p class="subtitle">Latest E2E & Unit Test Results for Modelibr (Last 10 Runs)</p>
    <div class="reports-grid" id="reports-container">
      <!-- Reports will be inserted here -->
    </div>
  </div>
  <script>
    // This will be populated by the bash script
    const reports = [
EOF

# Add report data to JavaScript array
FIRST=true
for DIR in "${REPORTS_DIR}"/run-*; do
  if [ -d "${DIR}" ]; then
    RUN_NUM=$(cat "${DIR}/run-number.txt")
    TIMESTAMP=$(cat "${DIR}/timestamp.txt")
    CONCLUSION=$(cat "${DIR}/conclusion.txt")
    BRANCH=$(cat "${DIR}/branch.txt" 2>/dev/null || echo "unknown")
    
    # Read test results JSON files
    BACKEND_RESULTS=$(cat "${DIR}/backend-results.json" 2>/dev/null || echo '{"total":0,"passed":0,"failed":0,"error":"Not found"}')
    FRONTEND_RESULTS=$(cat "${DIR}/frontend-results.json" 2>/dev/null || echo '{"total":0,"passed":0,"failed":0,"error":"Not found"}')
    BLENDER_RESULTS=$(cat "${DIR}/blender-results.json" 2>/dev/null || echo '{"total":0,"passed":0,"failed":0,"error":"Not found"}')
    
    # Convert timestamp to readable format using JavaScript
    if [ "${FIRST}" = true ]; then
      FIRST=false
    else
      echo "," >> "${REPORTS_DIR}/index.html"
    fi
    
    cat >> "${REPORTS_DIR}/index.html" << REPORT_EOF
      {
        runNumber: ${RUN_NUM},
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
done

# Complete the HTML
cat >> "${REPORTS_DIR}/index.html" << 'EOF'
    ];

    const container = document.getElementById('reports-container');
    
    function renderTestSection(name, results) {
      if (!results || results.error) {
        return `
          <div class="test-section">
            <div class="test-name">${name}</div>
            <div class="test-stats">
              <span style="color: #6c757d; font-size: 0.75rem;">Not available</span>
            </div>
          </div>
        `;
      }
      return `
        <div class="test-section">
          <div class="test-name">${name}</div>
          <div class="test-stats">
            <span class="test-stat">
              <span class="test-stat-passed">✓ ${results.passed}</span>
            </span>
            <span class="test-stat">
              <span class="test-stat-failed">✗ ${results.failed}</span>
            </span>
            <span class="test-stat">
              <span class="test-stat-total">Total: ${results.total}</span>
            </span>
          </div>
        </div>
      `;
    }
    
    if (reports.length === 0) {
      container.innerHTML = `
        <div class="no-reports">
          <h2>No Reports Available Yet</h2>
          <p>Playwright test reports will appear here after E2E tests have run successfully.</p>
          <p>Check back after the next CI pipeline completes.</p>
        </div>
      `;
    } else {
      reports.forEach(report => {
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
        const statusText = report.conclusion === 'success' ? '✓ Passed' : '✗ Failed';
        
        const card = document.createElement('div');
        card.className = 'report-card';
        card.innerHTML = `
          <div class="report-header">
            <div>
              <div class="run-number">Run #${report.runNumber}</div>
              <div class="branch-badge">🌿 ${report.branch || 'unknown'}</div>
            </div>
            <div class="status-badge ${statusClass}">${statusText}</div>
          </div>
          <div class="report-info">
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span>${formattedDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Time:</span>
              <span>${formattedTime}</span>
            </div>
          </div>
          <div class="test-results">
            <div class="test-results-title">
              <span>📊 Test Results</span>
            </div>
            ${renderTestSection('Backend (.NET)', report.backendTests)}
            ${renderTestSection('Frontend (Jest)', report.frontendTests)}
            ${renderTestSection('Blender Addon', report.blenderTests)}
          </div>
          <a href="${report.path}" class="view-button">View E2E Report →</a>
        `;
        container.appendChild(card);
      });
    }
  </script>
</body>
</html>
EOF

echo "Index page generated at ${REPORTS_DIR}/index.html"
echo "Successfully organized ${REPORT_COUNT} Playwright reports"
