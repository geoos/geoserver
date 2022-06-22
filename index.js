const version = "0.65";
const log = require("./lib/Logs")
const importer = require("./lib/Importer")
const deleter = require("./lib/Deleter")

importer.init();
deleter.init();
log.info("GEOOS GEOServer [" + version + " ]initialized");
console.log("GEOOS GEOServer [" + version + "] is Running")