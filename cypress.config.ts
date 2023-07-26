import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import browserify from "@badeball/cypress-cucumber-preprocessor/browserify";
import { defineConfig } from "cypress";
import { cloudPlugin } from "cypress-cloud/plugin";
import { debuggerPlugin } from "cypress-debugger";
import fetch from "node-fetch";
import xlsx from "node-xlsx";

async function setupNodeEvents(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions
): Promise<Cypress.PluginConfigOptions> {
  const {parse: parseCSV} = require("papaparse");
  const mapRelativeToHomeToFullPath = (relative) =>
    `${process.env.HOME}/${relative}`;
  const FormData = require("form-data");
  const fs = require("fs");
  const path = require("path");

  on(
    "file:preprocessor",
    browserify(config, {
      typescript: require.resolve("typescript"),
    })
  );

  // Have to add this task because Cypress.request() can not formData request
  on("task", {
    httpRequest({url, requestOptions, isFormData, fileKeyName}) {
      const formData = new FormData();
      let currentResponse;

      if (isFormData) {
        Object.keys(requestOptions.body).forEach((key) => {
          if (key === fileKeyName) {
            formData.append(
              fileKeyName,
              fs.createReadStream(path.resolve(`./${requestOptions.body[key]}`))
            );

            return;
          }

          if (Array.isArray(requestOptions.body[key])) {
            requestOptions.body[key].forEach((bodyElement) => {
              formData.append(key, bodyElement);
            });
          } else {
            formData.append(key, requestOptions.body[key]);
          }
        });
      }

      if (!isFormData) {
        requestOptions.headers["Content-Type"] = "application/json";
      }

      if (requestOptions.body) {
        requestOptions = {
          ...requestOptions,
          body: isFormData ? formData : JSON.stringify(requestOptions.body),
        };
      }

      return fetch(url, requestOptions)
        .then((response) => {
          currentResponse = response;

          return response.text();
        })
        .then((responseBodyText) => {
          return {
            status: currentResponse.status,
            ok: currentResponse.ok,
            headers: currentResponse.headers.raw(),
            body: responseBodyText,
          };
        });
    },
  });

  on("task", {
    readCSV({filePath, isRelativeToHome}) {
      const absFilePath = isRelativeToHome
        ? mapRelativeToHomeToFullPath(filePath)
        : `./${filePath}`;
      return new Promise((resolve, reject) => {
        try {
          resolve(
            parseCSV(fs.readFileSync(absFilePath).toString(), {header: true})
          );
        } catch (e) {
          reject(e);
        }
      });
    },
  });

  on("task", {
    parseXlsx({filePath}) {
      return new Promise((resolve, reject) => {
        try {
          const jsonData = xlsx.parse(fs.readFileSync(`./${filePath}`));
          resolve(jsonData);
        } catch (e) {
          reject(e);
        }
      });
    },
  });

  on("task", {
    removeFolder(dir) {
      return new Promise((resolve) => {
        fs.stat(`./${dir}`, (err) => {
          if (err) {
            resolve(err);
          } else {
            fs.rmdirSync(`./${dir}`, {recursive: true});
            resolve(true);
          }
        });
      });
    },
  });

  on("task", {
    waitFile(filePath) {
      function checkIfFileExists(
        onExists,
        onFailure,
        attemptNumber = 0,
        maxAttempts = 10,
        timeout = 300
      ) {
        if (fs.existsSync(path.resolve(`./${filePath}`))) {
          onExists(true);
        } else {
          if (++attemptNumber > maxAttempts) {
            onFailure(false);
          } else {
            setTimeout(
              () => checkIfFileExists(onExists, onFailure, attemptNumber),
              timeout
            );
          }
        }
      }

      return new Promise(checkIfFileExists);
    },
  });

  on("after:spec", (_spec, results) => {
    if (!results || !results.video) {
      return;
    }

    // Do we have failures for any retry attempts?
    const failures = results["tests"].some((test) => {
      return test["attempts"].some((attempt) => attempt["state"] === "failed");
    });

    if (!failures) {
      // delete the video if the spec passed and no tests retried
      return fs.unlinkSync(results.video);
    }
  });

  on(
    "before:browser:launch",
    (
      browser = {
        name: "",
        family: "chromium",
        channel: "",
        displayName: "",
        version: "",
        majorVersion: "",
        path: "",
        isHeaded: false,
        isHeadless: false,
      },
      launchOptions
    ) => {
      // the browser width and height we want to get
      // our screenshots and videos will be of that resolution
      const width: number = 1920;
      const height: number = 1080;

      if (browser.name === "chrome" && browser.isHeadless) {
        launchOptions.args.push(`--window-size=${width},${height}`);
        launchOptions.args.push(`--disable-dev-shm-usage`);

        // force screen to be non-retina and just use our given resolution
        launchOptions.args.push("--force-device-scale-factor=1");
      }

      if (browser.name === "electron" && browser.isHeadless) {
        // might not work on CI for some reason
        launchOptions.preferences.width = width;
        launchOptions.preferences.height = height;
      }

      if (browser.name === "firefox" && browser.isHeadless) {
        launchOptions.args.push(`--width=${width}`);
        launchOptions.args.push(`--height=${height}`);
      }

      // IMPORTANT: return the updated browser launch options
      return launchOptions;
    }
  );

  // This is required for the preprocessor to be able to generate JSON reports after each run, and more,

  return addCucumberPreprocessorPlugin(on, config)
    .then((config) => initDebugger(on, config))
    .then((config) => cloudPlugin(on, config));
}

function initDebugger(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions
) {
  return debuggerPlugin(on, config, {
    failedTestsOnly: false,
    targetDirectory: "cypress-traces",
    callback: (path) => {
      // eslint-disable-next-line no-console
      console.log("🎥 Recorded Cypress traces to: %s", path);
    },
  });
}

export default defineConfig({
  e2e: {
    excludeSpecPattern: "*.js",
    specPattern: "./cypress/integration/*.{ts,feature,features}",
    supportFile: "./cypress/support/index.js",
    fixturesFolder: "./cypress/fixtures",
    defaultCommandTimeout: 10000,
    video: true,
    videoUploadOnPasses: false,
    videoCompression: false,
    viewportWidth: 1920,
    viewportHeight: 1080,
    pageLoadTimeout: 61000,
    taskTimeout: 61000,
    watchForFileChanges: false,
    scrollBehavior: "center",
    includeShadowDom: true,
    numTestsKeptInMemory: 30,
    experimentalMemoryManagement: true,
    retries: {
      runMode: 1,
    },
    setupNodeEvents,
  },
});
