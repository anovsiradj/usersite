// Example JavaScript file for UserSite extension
// This script will be injected into matching websites

(function () {
  'use strict';

  console.debug('UserSite: Example script loaded!', 4);

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
  banner.textContent = 'UserSite: Custom script is active!';
  document.body.insertBefore(banner, document.body.firstChild);

  // Example: Log all links
  const links = document.querySelectorAll('a');
  console.debug(`UserSite: Found ${links.length} links on this page`);
  console.debug('UserSiteExample: file;');
})();
