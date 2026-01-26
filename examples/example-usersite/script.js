// Example JavaScript file for UserWeb extension
// This script will be injected into matching websites

(function() {
  'use strict';
  
  console.log('UserWeb: Example script loaded!');
  
  // Example: Add a custom banner
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #3498db;
    color: white;
    padding: 10px;
    text-align: center;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  banner.textContent = 'UserSite(5): Custom script is active!';
  document.body.insertBefore(banner, document.body.firstChild);
  
  // Example: Log all links
  const links = document.querySelectorAll('a');
  console.log(`UserWeb: Found ${links.length} links on this page`);
  
})();
