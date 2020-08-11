const log = require("./lib/Logs")
const importer = require("./lib/Importer")

importer.init();
log.info("GEOOS GEOServer initialized");
console.log("GEOOS GEOServer is Running")