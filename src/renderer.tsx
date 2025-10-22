/**
 * Entry point for the UI and App.tsx.
 * This file is responsible for rendering the main App component
 * into the DOM.
 *
 * STARTUP OPTIMIZATION:
 * - Shows immediate loader before React mount
 * - Tracks performance metrics
 * - Provides visual feedback during initialization
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './frontend/styles/index.css';
import { startupManager } from './frontend/utils/startupManager';

// Log renderer mount start
startupManager.logStage('renderer-mount');

// Create root element
const container = document.createElement('div');
container.id = 'root';
document.body.appendChild(container);

// Show immediate loading indicator (before React hydration)
const showImmediateLoader = () => {
  const loaderHTML = `
    <div id="startup-loader" style="
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #09090b;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;
        max-width: 28rem;
        padding: 2rem;
      ">
        <!-- Logo placeholder -->
        <div style="
          width: 8rem;
          height: 8rem;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          border-radius: 1rem;
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        "></div>
        
        <!-- Loading spinner -->
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          width: 100%;
        ">
          <svg style="
            width: 2rem;
            height: 2rem;
            animation: spin 1s linear infinite;
            color: #a1a1aa;
          " xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          
          <div style="text-align: center;">
            <p style="
              font-size: 1.125rem;
              font-weight: 500;
              color: #fafafa;
              margin: 0;
            ">
              Loading Dividr<span id="loading-dots"></span>
            </p>
            <p style="
              font-size: 0.875rem;
              color: #a1a1aa;
              margin-top: 0.5rem;
            ">
              Preparing your workspace
            </p>
          </div>
        </div>
        
        <!-- Helpful tip -->
        <div style="
          font-size: 0.75rem;
          color: #71717a;
          text-align: center;
          max-width: 24rem;
        ">
          <p style="margin: 0;">Loading your projects and workspace data</p>
        </div>
      </div>
      
      <style>
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      </style>
    </div>
  `;

  container.innerHTML = loaderHTML;

  // Animate dots
  let dotCount = 0;
  const dotsElement = document.getElementById('loading-dots');
  if (dotsElement) {
    setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      dotsElement.textContent = '.'.repeat(dotCount);
    }, 500);
  }
};

// Show loader immediately
showImmediateLoader();

// Create root and render (React will replace the loader)
const root = createRoot(container);

// Small delay to ensure loader is visible
setTimeout(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}, 100);
