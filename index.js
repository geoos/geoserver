const version = "0.63";
const log = require("./lib/Logs")
const importer = require("./lib/Importer")

importer.init();
log.info("GEOOS GEOServer [" + version + " ]initialized");
console.log("GEOOS GEOServer [" + version + "] is Running")