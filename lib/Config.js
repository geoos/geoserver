const fs = require("fs");
const log = require("./Logs");
const Hjson = require("hjson");
const webServer = require("./WebServer");

class Config {
    static get instance() {
        if (Config.singleton) return Config.singleton;
        Config.singleton = new Config();
        return Config.singleton;
    }

    init() {
        this.watchFiles = {};
        this.watchFiles[this.configPath + "/config.hjson"] = 0;
        this.callConfigDaemon(2000);
    }

    get timeZone() {return process.env.TIME_ZONE || "America/Santiago"}
    get logLevel() {return (process.env.LOG_LEVEL || "info").toLowerCase()}
    get logRetain() {return parseInt(process.env.LOG_RETAIN || "30")}
    get logPrefix() {return (process.env.LOG_PREFIX || "integrator-")}

    get dataPath() {return "/home/data"}
    get configPath() {return "/home/config"}
    get logPath() {return "/home/log"}
    get wwwPath() {return "/home/www"}

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
            let configPath = this.configPath + "/config.hjson";
            if (!firstRead) log.warn("Updating config from " + configPath);
            else log.info("Reading config from " + configPath);
            this.readConfig();
        } catch(error) {
            log.error("Config check error: " + error.toString());
        } finally {
            this.callConfigDaemon();
        }
    }
    readDataSetConfig(code) {
        try {
            let path = this.configPath + "/" + code + ".hjson";
            log.info("  -> reading dataSet config from " + path);
            this.watchFiles[path] = 0;
            this.watchFiles[path] = fs.statSync(path).mtimeMs;
            let hjson = fs.readFileSync(path).toString("utf8");
            return Hjson.parse(hjson);
        } catch(error) {
            throw "Error reading file: " + this.configPath + "/" + code + ".hjson: " + error.toString()
        }
    }
    readConfig() {
        try {
            this.watchFiles = {};
            let path = this.configPath + "/config.hjson";
            this.watchFiles[path] = fs.statSync(path).mtimeMs;
            let hjson = fs.readFileSync(path).toString("utf8");
            let importConfig = Hjson.parse(hjson);
            // Validate
            let providers = importConfig.providers;
            if (!providers) providers = {};
            for (const code in providers) {
                const p = providers[code];
                if (!p.name || typeof p.name != "string") throw `Provider ${code} should declare name as string`
                if (!p.url || typeof p.url != "string") throw `Provider ${code} should declare url as string`
                if (!p.logo || typeof p.logo != "string") throw `Provider ${code} should declare logo as string`
            }
            let dataSets = importConfig.dataSets;
            if (!dataSets) throw "dataSets not found in config";
            for (const code in dataSets) {
                const dataSet = dataSets[code];
                if (!dataSet.name || typeof dataSet.name != "string") throw "Must declare dataSet.name as string"
                dataSet.config = this.readDataSetConfig(code);
            }
            const oldConfig = this.importConfig;
            this.importConfig = importConfig;
            this.checkWebServerStatus(oldConfig, this.importConfig);
        } catch(error) {
            log.error("Error reading config file:" + error.toString());
            log.error("No file imports will be executed until error is corrected");
            this.checkWebServerStatus(this.importConfig, null);
            this.importConfig = null;
        }
    }

    checkWebServerStatus(oldConfig, newConfig) {
        if (!oldConfig) {
            if (!newConfig) return;
            webServer.start();
            return;
        } 
        if (!newConfig) {
            webServer.stop();
            return;
        }
        let oldDS = Object.keys(oldConfig.dataSets).reduce((map, dsCode) => {
            map[dsCode] = true;
            return map;
        }, {});
        let newDS = Object.keys(newConfig.dataSets).reduce((map, dsCode) => {
            map[dsCode] = true;
            return map;
        }, {});
        let changed = false;
        if (Object.keys(oldDS).length != Object.keys(newDS).length) changed = true;
        Object.keys(oldDS).forEach(code => delete newDS[code]);
        if (Object.keys(newDS).length) changed = true;
        if (oldConfig.webServer.protocol != newConfig.webServer.protocol) changed = true;
        if (oldConfig.webServer.port != newConfig.webServer.port) changed = true;
        if (changed) webServer.restart();
    }
}

module.exports = Config.instance;