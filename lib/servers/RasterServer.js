const AbstractServer = require("./AbstractServer");
const timeHelper = require("../helpers/TimeHelper");
const rasterHelper = require("../helpers/RasterHelper");
const config = require("../Config");
const fs = require("fs");
const gdal = require("../GDAL");

class RasterServer extends AbstractServer {
    static get instance() {
        if (RasterServer.singleton) return RasterServer.singleton;
        RasterServer.singleton = new RasterServer();
        return RasterServer.singleton;
    }

    registerEndPoints(app, dataSetCode, dataSet) {
        let commonQueries = dataSet.config.commonQueries || [];
        let variables = dataSet.config.variables || [];
        app.get("/" + dataSetCode + "/:varCode/:query", (req, res) => {
            let variable = variables[req.params.varCode];
            if (!variable) {
                this.returnDataError(res, `Cannot find variable '${varCode}' in dataSet '${dataSetCode}'`);
                return;
            }
            let query = req.params.query;
            if (commonQueries.indexOf(query) < 0 && (!variable.queries || variable.queries.indexOf(query) < 0)) {
                this.returnDataError(res, `Query '${query}' not supported by variable  '${req.params.varCode}' in dataSet '${dataSetCode}'`);
                return;
            }
            this.resolveQuery(dataSetCode, dataSet, req.params.varCode, query, req.query)
                .then(jsonResponse => {
                    if (!jsonResponse) {
                        this.returnInternalError(res, "No response data");
                    } else if (typeof jsonResponse == "object") {
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
                    } else {
                        this.returnInternalError(res, `Invalid response type '${typeof jsonResponse}' for response '${jsonResponse.toString()}'`);
                    }
                })
                .catch(error => this.returnInternalError(res, error.toString()))
        })
    }

    async findVarMetadata(dataSetCode, dataSet, varCode, searchTime) {
        try {
            let variable = dataSet.config.variables[varCode];
            let {time, searchDirection} = timeHelper.normalizeTime(dataSet, searchTime);
            let tryTime = time, direction = searchDirection;
            let maxTries = dataSet.config.temporality.searchTolerance;
            if (variable.searchTolerance !== undefined) maxTries = variable.searchTolerance;
            let varMetadata = null, foundTime = null, nTries = 0;
            let tryTime2 = null;
            do {
                varMetadata = await this.getVarMetadata(dataSetCode, dataSet, varCode, tryTime);
                if (!varMetadata) {
                    if (!tryTime2) {
                        tryTime2 = tryTime.clone();
                    } else {
                        varMetadata = await this.getVarMetadata(dataSetCode, dataSet, varCode, tryTime2);
                        if (varMetadata) foundTime = tryTime2;
                    }
                    if (!varMetadata) {
                        tryTime = timeHelper.incTime(dataSet, tryTime, direction);
                        tryTime2 = timeHelper.incTime(dataSet, tryTime2, -direction);
                    }
                } else {
                    foundTime = tryTime;
                }
                nTries++;
            } while(!foundTime && ++nTries < maxTries)
            if (varMetadata) return {varMetadata:varMetadata, foundTime:foundTime}
            return {varMetadata:null, foundTime:null}
        } catch (error) {
            throw error;
        }
    }

    async getVarMetadata(dataSetCode, dataSet, varCode, time) {
        try {
            let targetFilePath = dataSetCode + "/" + timeHelper.getPathForTime(dataSetCode, dataSet, time);
            targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + timeHelper.getTimeForFileName(dataSetCode, dataSet, time) + ".json";
            try {
                let json = await fs.promises.readFile(targetFilePath);
                return JSON.parse(json);
            } catch {
                return null;
            }
        } catch (error) {
            throw error;
        }
    }

    async resolveQuery(dataSetCode, dataSet, varCode, query, params) {
        try {
            switch(query) {
                case "valueAtPoint":
                    return this.valueAtPoint(dataSetCode, dataSet, varCode, params)
                default:
                    throw "Format " + format + " Not Implemented";
            }
        } catch(error) {
            throw error;
        }
    }

    async valueAtPoint(dataSetCode, dataSet, varCode, params) {
        try {
            let timeParam = params.time;
            if (!timeParam) return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = timeHelper.parseTime(timeParam);
            if (!searchTime) return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            let latParam = params.lat;
            if (latParam === undefined) return {errorCode:"data", errorText:"Missing 'lat' parameter"};
            let lat = parseFloat(latParam);
            if (isNaN(lat)) return {errorCode:"data", errorText:"Invalid format for lat: '" + latParam + "'"};
            let lngParam = params.lng;
            if (lngParam === undefined) return {errorCode:"data", errorText:"Missing 'lng' parameter"};
            let lng = parseFloat(lngParam);
            if (isNaN(lng)) return {errorCode:"data", errorText:"Invalid format for lng: '" + lngParam + "'"};

            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}

            let {varMetadata, foundTime} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let point = rasterHelper.normalizePoint(varMetadata, lat, lng);

            let targetFilePath = dataSetCode + "/" + timeHelper.getPathForTime(dataSetCode, dataSet, foundTime);
            targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + timeHelper.getTimeForFileName(dataSetCode, dataSet, foundTime) + ".grb2";

            let value = await gdal.locationinfo(targetFilePath, point.x, point.y);

            return {
                value:value,
                searchTime:{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")},
                foundTime:{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")},
                searchPoint:{lat:lat, lng:lng},
                foundPoint:{lat:point.lat, lng:point.lng},
                metadata:varMetadata.metadata?varMetadata.metadata:{}
            }
        } catch (error) {
            throw error;
        }
    }


}

module.exports = RasterServer.instance;