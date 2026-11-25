/*
 * The studio's engine under Node: require("linked-archi-metamodel-studio") gives what the page has as
 * window.LAStudio, without its user interface (SD-1, SD-19). These calls are not frozen yet: A2 makes the engine a
 * package of its own.
 */
"use strict";

module.exports = {
  core: require("./js/core.js"),
  generator: require("./js/generator.js"),
  importer: require("./js/importer.js"),
  lint: require("./js/lint.js"),
  zip: require("./js/zip.js"),
  /** The starting points, by key: blank, cloudplatform, archimate4. Read when first asked for: they are 362 KB. */
  get templates() { return require("./templates/templates.js"); },
  version: require("./package.json").version,
};
