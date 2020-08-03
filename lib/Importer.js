const config = require("./Config");
const log = require("./Logs");
const fs = require("fs");
const Hjson = require("hjson");
const rasterImporter = require("./RasterImporter");
const RasterImporter = require("./RasterImporter");

class Importer {
    static get instance() {
        if (Importer.singleton) return Importer.singleton;
        Importer.singleton = new Importer();
        return Importer.singleton;
    }

    init() {
        let logsPath = config.dataPath + "/logs";
        if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath);
        let importPath = config.dataPath + "/import";
        if (!fs.existsSync(importPath)) fs.mkdirSync(importPath);
        let configPath = config.dataPath + "/config";
        if (!fs.existsSync(configPath)) fs.mkdirSync(configPath);
        let configFilePath = configPath + "/config.hjson";
        if (!fs.existsSync(configFilePath)) {
            fs.copyFileSync("./lib/res/sample-config.hjson", configFilePath);
        }
        let wwwPath = config.dataPath + "/www";
        if (!fs.existsSync(wwwPath)) fs.mkdirSync(wwwPath);
        let tmpPath = config.dataPath + "/tmp";
        if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath);
        let workingPath = config.dataPath + "/working";
        if (!fs.existsSync(workingPath)) fs.mkdirSync(workingPath);
        let withErrors = config.dataPath + "/files-with-errors";
        if (!fs.existsSync(withErrors)) fs.mkdirSync(withErrors);
        let discarded = config.dataPath + "/discarded";
        if (!fs.existsSync(discarded)) fs.mkdirSync(discarded);

        this.callConfigDaemon(2000);
        this.callImportDaemon(5000);
    }

    callConfigDaemon(ms = 5000) {
        if (this.timerConfig) clearTimeout(this.timerConfig);
        this.timerConfig = setTimeout(_ => {
            this.timerConfig = null;
            this.configDaemon();
        }, ms);
    }
    configDaemon() {
        try {
            let configPath = config.dataPath + "/config/config.hjson";
            let fileTime = fs.statSync(configPath).mtimeMs;
            if (fileTime != this.configTime) {
                if (this.configTime) log.warn("Updating config from " + configPath);
                else log.info("Reading config from " + configPath);
                this.readConfig();
                this.configTime = fileTime;
            }
        } finally {
            this.callConfigDaemon();
        }
    }
    readConfig() {
        try {
            let hjson = fs.readFileSync(config.dataPath + "/config/config.hjson").toString("utf8");
            let importConfig = Hjson.parse(hjson);
            // Validate
            let provider = importConfig.provider;
            if (!provider) throw "provider not found in config";
            if (!provider.code || typeof provider.code != "string") throw "Must declare provider.code as string"
            if (!provider.name || typeof provider.name != "string") throw "Must declare provider.name as string"
            if (!provider.publicURL || typeof provider.publicURL != "string") throw "Must declare provider.publicURL as string"
            if (importConfig.origins) {
                if (!Array.isArray(importConfig.origins)) throw "origins should be an array";
                importConfig.origins.forEach((o, i) => {
                    if (!o.code || typeof o.code != "string") throw `Origin ${i+1} should declare code as string`
                    if (!o.name || typeof o.name != "string") throw `Origin ${i+1} should declare name as string`
                    if (!o.url || typeof o.url != "string") throw `Origin ${i+1} should declare url as string`
                    if (!o.logo || typeof o.logo != "string") throw `Origin ${i+1} should declare logo as string`
                })
            }
            this.importConfig = importConfig;
        } catch(error) {
            log.error("Error reading config file:" + error.toString());
            log.error("No file imports will be executed until error is corrected");
            this.importConfig = null;
        }
    }

    callImportDaemon(ms = 5000) {
        if (this.timerImport) clearTimeout(this.timerImport);
        this.timerImport = setTimeout(_ => {
            this.timerImport = null;
            this.importDaemon();
        }, ms);
    }

    async moveToWorking(fileName) {
        try {
            let target = config.dataPath + "/working/" + fileName;
            await fs.promises.rename(config.dataPath+ "/import/" + fileName, target);
            return target;
        } catch (error) {
            if (error.code == "ENOENT") return null;
            throw error;
        }
    }
    async moveToErrors(fileName) {
        try {
            let target = config.dataPath + "/files-with-errors/" + fileName;
            await fs.promises.rename(config.dataPath+ "/working/" + fileName, target);
        } catch (error) {
            throw error;
        }
    }
    async moveToDiscarded(fileName) {
        try {
            let target = config.dataPath + "/discarded/" + fileName;
            await fs.promises.rename(config.dataPath+ "/working/" + fileName, target);
        } catch (error) {
            throw error;
        }
    }
    async importDaemon() {
        try {
            if (!this.importConfig) return;
            const importPath = config.dataPath + "/import";
            const workPath = config.dataPath + "/working";
            const errorsPath = config.dataPath + "/files-with-errors";
            const discardedPath = config.dataPath + "/discarded";
            let inputFiles = await fs.promises.readdir(importPath);
            for await (let fileName of inputFiles) {
                let workingFile;
                try {
                    workingFile = await this.moveToWorking(fileName);
                } catch(error) {
                    log.error(`Error moving file ${fileName} to ${workPath}: : ${error.toString()}`);
                }
                if (!workingFile) continue;
                if (RasterImporter.isRasterFile(fileName)) {
                    try {
                        await RasterImporter.importFile(fileName, workingFile, this.importConfig);
                    } catch(error) {
                        log.error(`Error importing file ${fileName}: ${error.toString()}`);
                        log.error("  -> file moved to /home/data/files-with-errors");
                        try {
                            await this.moveToErrors(fileName);
                        } catch(err) {}
                    }
                } else {
                    try {
                        log.warn(`Importing ${fileName}. File type not recognized. Moving to /home/data/discarded`)
                        await this.moveToDiscarded(fileName);
                    } catch(err) {}
                }
            }
        } finally {
            this.callImportDaemon();
        }
    }
}

module.exports = Importer.instance;