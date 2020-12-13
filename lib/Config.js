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
    get logPrefix() {return (process.env.LOG_PREFIX || "geoserver-")}

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
            let serverConfig = Hjson.parse(hjson);
            // Validate
            let providers = serverConfig.providers;
            if (!providers) providers = {};
            for (const code in providers) {
                const p = providers[code];
                if (!p.name || typeof p.name != "string") throw `Provider ${code} should declare name as string`
                if (!p.url || typeof p.url != "string") throw `Provider ${code} should declare url as string`
                if (!p.logo || typeof p.logo != "string") throw `Provider ${code} should declare logo as string`
            }
            let dataSets = serverConfig.dataSets;
            if (!dataSets) throw "dataSets not found in config";
            for (const code in dataSets) {
                const dataSet = dataSets[code];
                if (!dataSet.name || typeof dataSet.name != "string") throw "Must declare dataSet.name as string"
                dataSet.config = this.readDataSetConfig(code);
            }
            const oldConfig = this.serverConfig;
            this.serverConfig = serverConfig;
            this.checkWebServerStatus(oldConfig, this.serverConfig);
            this.buildPublicMetadata();
            require("./servers/GeoJsonServer").clearCache();
        } catch(error) {
            log.error("Error reading config file:" + error.toString());
            log.error("No file imports will be executed until error is corrected");
            this.checkWebServerStatus(this.serverConfig, null);
            this.serverConfig = null;
            this.buildPublicMetadata();
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

    extendOptions(target, source) {
        for (let name in source) {
            let v = source[name];
            if (typeof v == "object") {
                if (!target[name]) target[name] = {}
                if (typeof target[name] != "object") throw "Invalid options inheritance. Target object type for '" + name + "' is not an object";
                this.extendOptions(target[name], v);
            } else if (Array.isArray(v)) {
                let tgtArray = target[name] || [];
                tgtArray = tgtArray.concat(v);
                target[name] = tgtArray;
            } else {
                if (target[name] === undefined) target[name] = v;
            }
        }
    }
    buildPublicMetadata() {
        if (!this.serverConfig) {
            this.publicMetadata = null;
            return;
        }
        let m = {
            code:this.serverConfig.thisGeoServer.code, name:this.serverConfig.thisGeoServer.name,
            publicURL:this.serverConfig.publicURL,
            providers:[],
            dataSets:[],
            colorScales:this.serverConfig.colorScales
        }
        if (this.serverConfig.providers) {
            for (let code in this.serverConfig.providers) {
                let provider = this.serverConfig.providers[code];
                let providerMetadata = {code:code, name:provider.name, url:provider.url, logo:provider.logo}
                if (provider.options) providerMetadata.options = provider.options;
                m.providers.push(providerMetadata);
            }
        }
        if (this.serverConfig.dataSets) {
            for (let dsCode in this.serverConfig.dataSets) {
                let dataSet = this.serverConfig.dataSets[dsCode];
                let dsConfig = dataSet.config;
                let dsMetadata = {
                    code:dsCode, name:dataSet.name, provider:dataSet.provider, type:dsConfig.dataSet.type
                }
                if (dsConfig.options) dsMetadata.options = dsConfig.options;
                
                if (dsMetadata.type == "raster") {
                    dsMetadata.temporality = typeof dsConfig.temporality == "object"?{value:dsConfig.temporality.value, unit:dsConfig.temporality.unit}:dsConfig.temporality;
                    if (dsConfig.limits) dsMetadata.limits = dsConfig.limits;
                    dsMetadata.variables = [];
                    for (let varCode in dsConfig.variables) {
                        let variable = dsConfig.variables[varCode];
                        let hidden = variable.options && variable.options.hidden;
                        if (!hidden) {
                            let varMetadata = {
                                code:varCode, name:variable.name, unit:variable.unit
                            }
                            if (variable.options) varMetadata.options = variable.options;
                            if (variable.levels) varMetadata.levels = variable.levels.descriptions;
                            varMetadata.queries = ["valueAtPoint", "grid", "isolines", "isobands"];
                            if (variable.vector && variable.vector.uComponent && variable.vector.vComponent) {
                                varMetadata.queries.push("vectorsGrid");
                            }
                            let varOptions =  variable.options || {};
                            if (!varOptions.regions) varOptions.regions = [];
                            if (!varOptions.subjects) varOptions.subjects = [];
                            if (!varOptions.types) varOptions.types = [];
                            varOptions = JSON.parse(JSON.stringify(varOptions));
                            if (dsConfig.variablesDefaults && dsConfig.variablesDefaults.options) {
                                this.extendOptions(varOptions, dsConfig.variablesDefaults.options);
                            }
                            varMetadata.options = varOptions;
                            dsMetadata.variables.push(varMetadata);
                        }
                    }
                } else if (dsMetadata.type == "vector") {
                    dsMetadata.temporality = typeof dsConfig.temporality == "object"?{value:dsConfig.temporality.value, unit:dsConfig.temporality.unit}:dsConfig.temporality;
                    if (dsConfig.limits) dsMetadata.limits = dsConfig.limits;                    
                    dsMetadata.files = [];
                    for (let fileName in dsConfig.files) {
                        let file = dsConfig.files[fileName];
                        let fileMetadata = JSON.parse(JSON.stringify(file.metadata));                        
                        fileMetadata.name = fileName;
                        fileMetadata.commonName = file.commonName || fileName;
                        let fileOptions =  file.options || {};
                        if (!fileOptions.regions) fileOptions.regions = [];
                        if (!fileOptions.subjects) fileOptions.subjects = [];
                        if (!fileOptions.types) fileOptions.types = [];
                        fileOptions = JSON.parse(JSON.stringify(fileOptions));
                        if (dsConfig.filesDefault && dsConfig.filesDefault.options) {
                            this.extendOptions(fileOptions, dsConfig.filesDefault.options);
                        }
                        fileMetadata.options = fileOptions;
                        dsMetadata.files.push(fileMetadata);
                    }
                }
                m.dataSets.push(dsMetadata);
            }
        }
        this.publicMetadata = m;
    }
}

module.exports = Config.instance;