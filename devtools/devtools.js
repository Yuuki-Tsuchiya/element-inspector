'use strict';

chrome.devtools.panels.create(
  'Element Inspector',
  '',
  '/devtools/panel.html',
  (panel) => {
    console.log('Element Inspector panel created');
  }
);
