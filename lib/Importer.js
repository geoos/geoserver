const config = require("./Config");
const log = require("./Logs");
const fs = require("fs");
const RasterImporter = require("./RasterImporter");

class Importer {
    static get instance() {
        if (Importer.singleton) return Importer.singleton;
        Importer.singleton = new Importer();
        return Importer.singleton;
    }

    init() {
        let importPath = config.dataPath + "/import";
        if (!fs.existsSync(importPath)) fs.mkdirSync(importPath);
        let configFilePath = config.configPath + "/config.hjson";
        if (!fs.existsSync(configFilePath)) {
            fs.copyFileSync("./lib/res/sample-config.hjson", configFilePath);
        }
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

        config.init();
        this.callImportDaemon(5000);
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
            if (!config.importConfig) return;
            const importerConfig = config.importConfig;
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
                let dataSetCode, dataSet;
                try {
                    let p = fileName.indexOf("_");
                    if (p > 0) {
                        dataSetCode = fileName.substr(0,p);
                    } else {
                        p = fileName.lastIndexOf(".");
                        dataSetCode = fileName.substr(0,p);
                    }
                    dataSet = importerConfig.dataSets[dataSetCode];
                    if (!dataSet) throw "No dataSet declared with code '" + dataSetCode + "'";
                } catch(error) {
                    log.error(`Error importing file ${fileName}: ${error.toString()}`);
                    log.error("  -> file moved to /home/data/files-with-errors");
                    try {
                        await this.moveToErrors(fileName);
                    } catch(err) {}
                    continue;
                }
                if (dataSet.config.dataSet.type == "raster") {
                    try {
                        await RasterImporter.importFile(dataSetCode, dataSet, fileName, workingFile, config.importConfig);
                        try {
                            if (dataSet.config.deleteFinishedFiles) {
                                log.debug("Removing file: " + workingFile);
                                await fs.promises.unlink(workingFile);
                            } else {
                                log.debug("Moving file: " + workingFile + " to '/home/data/finished'");
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
        } catch(error) {
            log.error("Importer daemon: " + error.toString());
        } finally {
            this.callImportDaemon();
        }
    }
}

module.exports = Importer.instance;