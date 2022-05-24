const AbstractServer = require("./AbstractServer");
const config = require("../Config");
const fs = require("fs");
const geojsonvt = require("geojson-vt");
const timeHelper = require("../helpers/TimeHelper");

class GeoJsonServer extends AbstractServer {
    static get instance() {
        if (GeoJsonServer.singleton) return GeoJsonServer.singleton;
        GeoJsonServer.singleton = new GeoJsonServer();
        return GeoJsonServer.singleton;
    }

    constructor() {
        super();
        this.filesCache = {};
        this.tiledFilesCache = {};
    }

    clearCache() {
        this.filesCache = {};
        this.tiledFilesCache = {};
    }
    registerEndPoints(app, dataSetCode) {
        app.get("/" + dataSetCode + "/:file/metadata", (req, res) => {
            let dataSet = config.serverConfig.dataSets[dataSetCode];
            let files = dataSet.config.files || {};
            let file = files[req.params.file];
            if (!file) {
                this.returnDataError(res, `Cannot find file declaration '${req.params.file}' in dataSet '${dataSetCode}'`);
                return;
            }
            this.resolveMetadata(dataSetCode, req.params.file, req.query)
                .then(jsonResponse => {
                    if (jsonResponse.errorCode) {
                        switch (jsonResponse.errorCode) {
                            case "notFound": 
                                this.returnNotFoundError(res, jsonResponse.errorText);
                                break;
                            case "data": 
                                this.returnDataError(res, jsonResponse.errorText);
                                break;
                            default: 
                                this.returnInternalError(res, "Invalid error code '" + jsonResponse.errorCode + "' for error: " + jsonResponse.errorText);
                                break;
                        }
                    } else {
                        this.returnJson(res, jsonResponse);
                    }
                })
                .catch(error => this.returnInternalError(res, error.toString()))
        })
        app.get("/" + dataSetCode + "/:file/geoJson", (req, res) => {
            let dataSet = config.serverConfig.dataSets[dataSetCode];
            let files = dataSet.config.files || {};
            let file = files[req.params.file];
            if (!file) {
                this.returnDataError(res, `Cannot find file declaration '${req.params.file}' in dataSet '${dataSetCode}'`);
                return;
            }
            this.resolveGeoJson(dataSetCode, req.params.file, req.query)
                .then(jsonResponse => {
                    if (jsonResponse.errorCode) {
                        switch (jsonResponse.errorCode) {
                            case "notFound": 
                                this.returnNotFoundError(res, jsonResponse.errorText);
                                break;
                            case "data": 
                                this.returnDataError(res, jsonResponse.errorText);
                                break;
                            default: 
                                this.returnInternalError(res, "Invalid error code '" + jsonResponse.errorCode + "' for error: " + jsonResponse.errorText);
                                break;
                        }
                    } else {
                        this.returnJson(res, jsonResponse);
                    }
                })
                .catch(error => this.returnInternalError(res, error.toString()))
        })
        app.get("/" + dataSetCode + "/:file/tile/:z/:x/:y", (req, res) => {
            let dataSet = config.serverConfig.dataSets[dataSetCode];
            let files = dataSet.config.files || {};
            let file = files[req.params.file];
            if (!file) {
                
                return;
            }
            let z = parseInt(req.params.z);
            if (isNaN(z)) {
                this.returnDataError(res, `Invalid z coodinate '${req.params.z}' in dataSet '${dataSetCode}' tile query`);
                return;
            }
            let x = parseInt(req.params.x);
            if (isNaN(x)) {
                this.returnDataError(res, `Invalid z coodinate '${req.params.x}' in dataSet '${dataSetCode}' tile query`);
                return;
            }
            let y = parseInt(req.params.y);
            if (isNaN(y)) {
                this.returnDataError(res, `Invalid z coodinate '${req.params.y}' in dataSet '${dataSetCode}' tile query`);
                return;
            }
            //console.log("getVectorTiel", z, x, y);
            this.resolveGeoJsonTile(dataSetCode, req.params.file, req.query, z, x, y)
                .then(jsonResponse => {
                    if (jsonResponse.errorCode) {
                        switch (jsonResponse.errorCode) {
                            case "notFound": 
                                this.returnNotFoundError(res, jsonResponse.errorText);
                                break;
                            case "data": 
                                this.returnDataError(res, jsonResponse.errorText);
                                break;
                            default: 
                                this.returnInternalError(res, "Invalid error code '" + jsonResponse.errorCode + "' for error: " + jsonResponse.errorText);
                                break;
                        }
                    } else {
                        this.returnJson(res, jsonResponse);
                    }
                })
                .catch(error => this.returnInternalError(res, error.toString()))
        })
    }

    async findFileLocations(dataSetCode, dataSet, fileName, searchTime) {
        try {
            if (dataSet.config.temporality == "none") {
                let {metadata, dataFile} = await this.getFileLocations(dataSetCode, dataSet, fileName);
                return {metadata:metadata, foundTime:null, dataFile:dataFile}
            }
            let file = dataSet.config.files[fileName];
            let {time, searchDirection} = timeHelper.normalizeTime(dataSet, searchTime);
            let tryTime = time, direction = searchDirection;
            let maxTries = dataSet.config.filesDefaults.searchTolerance || 0;
            if (file.searchTolerance !== undefined) maxTries = file.searchTolerance;
            let fileMetadata = null, foundTime = null, nTries = 0, dataFilePath = null;;
            let tryTime2 = null;
            do {
                let {metadata, dataFile} = await this.getFileLocations(dataSetCode, dataSet, fileName, tryTime);
                fileMetadata = metadata; dataFilePath = dataFile;
                if (!fileMetadata) {
                    if (!tryTime2) {
                        tryTime2 = tryTime.clone();
                    } else {
                        let {metadata, dataFile} = await this.getFileLocations(dataSetCode, dataSet, fileName, tryTime2);
                        fileMetadata = metadata; dataFilePath = dataFile;
                        if (fileMetadata) foundTime = tryTime2;
                    }
                    if (!fileMetadata) {
                        tryTime = timeHelper.incTime(dataSet, tryTime, direction);
                        tryTime2 = timeHelper.incTime(dataSet, tryTime2, -direction);
                    }
                } else {
                    foundTime = tryTime;
                }
                nTries++;
            } while(!foundTime && ++nTries < maxTries)
            if (fileMetadata) return {metadata:fileMetadata, foundTime:foundTime, dataFile:dataFilePath}
            return {metadata:null, foundTime:null, dataFile:null}
        } catch (error) {
            throw error;
        }
    }

    fileExists(path) {
        return new Promise(resolve => {
            fs.access(path, err => {
                if (err) resolve(false);
                else resolve(true);
            })
        })
    }

    async getFileLocations(dataSetCode, dataSet, fileName, time) {
        try {
            let targetFilePath;
            if (dataSet.config.temporality == "none") {
                targetFilePath = config.dataPath + "/" + dataSetCode + "/" + fileName;
            } else {
                targetFilePath = dataSetCode + "/" + timeHelper.getPathForTime(dataSetCode, dataSet, time);
                targetFilePath = config.dataPath + "/" + targetFilePath + "/" + fileName + "_" + timeHelper.getTimeForFileName(dataSetCode, dataSet, time);
            }
            if (await this.fileExists(targetFilePath + ".geojson")) {
                return {metadata:targetFilePath + ".json", dataFile:targetFilePath + ".geojson"};
            } else {
                return {metadata:null, dataFile:null};
            }
        } catch (error) {
            throw error;
        }
    }

    async resolveMetadata(dataSetCode, fileName, params) {
        try {
            let dataSet = config.serverConfig.dataSets[dataSetCode];

            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};

            let {metadata, foundTime, dataFile} = await this.findFileLocations(dataSetCode, dataSet, fileName, searchTime);
            if (!dataFile) return {errorCode:"notFound", errorText:"No Data"}

            let json = await fs.promises.readFile(metadata);
            let ret = JSON.parse(json);
            if (foundTime) {
                ret.searchTime = searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null;
                ret.foundTime = foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null;
            }
            return ret;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async getGeoJsonFile(dataSet, fileName, path) {
        try {
            let file = dataSet.config.files[fileName];
            if (!file.cache) return JSON.parse(await fs.promises.readFile(path));
            let stats = fs.promises.stat(path);
            let fileTime = (await stats).mtime.getTime();
            let cached = this.filesCache[path];
            if (cached && cached.time == fileTime) {
                cached.lastQuery = Date.now();
                return cached.content;
            }
            let content = JSON.parse(await fs.promises.readFile(path));
            this.filesCache[path] = {
                time:fileTime, lastQuery:Date.now(), content:content
            }
            let maxCacheSize = dataSet.config.maxFilesInCache || 30;
            if (Object.keys(this.filesCache) > maxCacheSize) {
                let cacheList = Object.keys(this.filesCache).map(path => ({path:path, lastQuery:this.filesCache[path].lastQuery}))
                cacheList.sort((c1, c2) => (c1.lastQuery - c2.lastQuery));
                while (Object.keys(this.filesCache) > maxCacheSize) {
                    delete this.filesCache[cacheList[0].path];
                    cacheList.splice(0,1);
                }
            }
            return content;
        } catch (error) {
            throw error;
        }
    }

    async resolveGeoJson(dataSetCode, fileName, params) {
        try {
            let dataSet = config.serverConfig.dataSets[dataSetCode];

            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};

            let {metadata, foundTime, dataFile} = await this.findFileLocations(dataSetCode, dataSet, fileName, searchTime);
            if (!dataFile) return {errorCode:"notFound", errorText:"No Data"}

            let ret = {}
            if (foundTime) {
                ret.searchTime = searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null;
                ret.foundTime = foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null;
            }
            if (params.metadata && params.metadata == "true") {
                let json = await fs.promises.readFile(metadata);
                ret.metadata = JSON.parse(json);   
            }            
            ret.geoJson = await this.getGeoJsonFile(dataSet, fileName, dataFile);
            return ret;
        } catch (error) {
            throw error;
        }
    }

    async getGeoJsonFileTile(dataSet, fileName, path, z, x, y) {
        try {
            let file = dataSet.config.files[fileName];
            let promoteId = "id";
            if (file.metadata && file.metadata.idProperty) promoteId = file.metadata.idProperty;
            let tolerance = 5;
            if (file.simplifyTolerance) tolerance = file.simplifyTolerance;

            if (!file.tiledCache) {
                let geoJson = JSON.parse(await fs.promises.readFile(path));
                let tileIndex = geojsonvt(geoJson, {extent:4096, promoteId, tolerance});
                return tileIndex.getTile(z, x, y).features;
            }
            while(this.tiledFilesCache[path] == "building") {
                await new Promise(resolve => setTimeout(_ => resolve(), 50))
            }
            let cached = this.tiledFilesCache[path];
            if (!cached) this.tiledFilesCache[path] = "building";

            let stats = await fs.promises.stat(path);
            let fileTime = stats.mtime.getTime();
            if (cached && cached.time == fileTime) {
                cached.lastQuery = Date.now();
                let t = cached.tileIndex.getTile(z, x, y);
                if (!t || !t.features) return [];
                return t.features;
            }
            this.tiledFilesCache[path] = "building";

            let geoJson = JSON.parse(await fs.promises.readFile(path));
            let tileIndex = geojsonvt(geoJson, {
                extent:4096, promoteId, tolerance
            });
            this.tiledFilesCache[path] = {
                time:fileTime, lastQuery:Date.now(), tileIndex:tileIndex
            }
            let maxCacheSize = dataSet.config.maxTiledFilesInCache || 30;
            if (Object.keys(this.tiledFilesCache) > maxCacheSize) {
                let cacheList = Object.keys(this.tiledFilesCache).map(path => ({path:path, lastQuery:this.tiledFilesCache[path].lastQuery}))
                cacheList.sort((c1, c2) => (c1.lastQuery - c2.lastQuery));
                while (Object.keys(this.tiledFilesCache) > maxCacheSize) {
                    delete this.tiledFilesCache[cacheList[0].path];
                    cacheList.splice(0,1);
                }
            }
            let tile = tileIndex.getTile(z, x, y);
            if (!tile || !tile.features) return [];
            console.log("tile", file.features.length);
            return tile.features;
        } catch (error) {
            console.trace(error);
            throw error;
        }
    }

    async resolveGeoJsonTile(dataSetCode, fileName, params, z, x, y) {
        try {
            let dataSet = config.serverConfig.dataSets[dataSetCode];

            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};

            let {metadata, foundTime, dataFile} = await this.findFileLocations(dataSetCode, dataSet, fileName, searchTime);
            if (!dataFile) return {errorCode:"notFound", errorText:"No Data"}

            return await this.getGeoJsonFileTile(dataSet, fileName, dataFile, z, x, y);
            return ret;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = GeoJsonServer.instance;