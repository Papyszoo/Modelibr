import React, { useEffect } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function PlaywrightReports(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  
  useEffect(() => {
    // Redirect to the static HTML page
    window.location.href = `${siteConfig.baseUrl}playwright-reports/index.html`;
  }, [siteConfig.baseUrl]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      fontSize: '1.5rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎭</h1>
        <p>Redirecting to Playwright Reports...</p>
      </div>
    </div>
  );
}
