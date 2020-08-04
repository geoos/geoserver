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
        let configFilePath = config.configPath + "/config.hjson";
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
        let finished = config.dataPath + "/finished";
        if (!fs.existsSync(finished)) fs.mkdirSync(finished);

        this.watchFiles = {};
        this.watchFiles[config.configPath + "/config.hjson"] = 0;

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
            let changed = false, firstRead = false;
            for (const filePath in this.watchFiles) {
                let currentTime = this.watchFiles[filePath];
                if (!currentTime) firstRead = true;
                changed = currentTime != fs.statSync(filePath).mtimeMs;
                if (changed) break;
            }
            if (!changed) return;
            let configPath = config.configPath + "/config.hjson";
            if (!firstRead) log.warn("Updating config from " + configPath);
            else log.info("Reading config from " + configPath);
            this.readConfig();
        } catch(error) {
            log.error("Config check error: " + error.toString());
        } finally {
            this.callConfigDaemon();
        }
    }
    readProviderConfig(code) {
        try {
            let path = config.configPath + "/" + code + ".hjson";
            log.info("  -> reading provider config from " + path);
            this.watchFiles[path] = 0;
            this.watchFiles[path] = fs.statSync(path).mtimeMs;
            let hjson = fs.readFileSync(path).toString("utf8");
            return Hjson.parse(hjson);
        } catch(error) {
            throw "Error reading file: " + config.configPath + "/" + code + ".hjson: " + error.toString()
        }
    }
    readConfig() {
        try {
            this.watchFiles = {};
            let path = config.configPath + "/config.hjson";
            this.watchFiles[path] = fs.statSync(path).mtimeMs;
            let hjson = fs.readFileSync(path).toString("utf8");
            let importConfig = Hjson.parse(hjson);
            // Validate
            let origins = importConfig.origins;
            if (!origins) origins = {};
            for (const code in origins) {
                const o = origins[code];
                if (!o.name || typeof o.name != "string") throw `Origin ${i+1} should declare name as string`
                if (!o.url || typeof o.url != "string") throw `Origin ${i+1} should declare url as string`
                if (!o.logo || typeof o.logo != "string") throw `Origin ${i+1} should declare logo as string`
            }
            let providers = importConfig.providers;
            if (!providers) throw "provider not found in config";
            for (const code in providers) {
                const provider = providers[code];
                if (!provider.name || typeof provider.name != "string") throw "Must declare provider.name as string"
                provider.config = this.readProviderConfig(code);
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
    async moveToFinished(fileName) {
        try {
            let target = config.dataPath + "/finished/" + fileName;
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
                        let provider = await RasterImporter.importFile(fileName, workingFile, this.importConfig);
                        try {
                            if (provider.config.deleteFinishedFiles) {
                                await fs.promises.unlink(workingFile);
                            } else {
                                await this.moveToFinished(fileName);
                            }
                        } catch(err) {}
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