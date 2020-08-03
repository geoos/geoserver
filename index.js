const log = require("./lib/Logs")
const importer = require("./lib/Importer")

importer.init();
log.info("GEOOS Provider initialized");
console.log("GEOOS Provider is Running")