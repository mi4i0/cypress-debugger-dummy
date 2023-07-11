import { Then } from '@badeball/cypress-cucumber-preprocessor';

Then(/^I should go to "([^"]*)" page$/, (path: string) => {
  cy.visit(path);
});