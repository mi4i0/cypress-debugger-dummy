// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import { debuggerSupport } from "cypress-debugger";

import "./commands";
// Alternatively you can use CommonJS syntax:
// require('./commands')
debuggerSupport();

// eslint-disable-next-line no-undef
Cypress.on("uncaught:exception", () => {
  // returning false here prevents Cypress from
  // failing the test
  return false;
});

Cypress.on("window:before:unload", (event) => {
  event.stopImmediatePropagation();
});
