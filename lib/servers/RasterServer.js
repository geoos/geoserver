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
        let variables = dataSet.config.variables || [];
        app.get("/" + dataSetCode + "/:varCode/:query", (req, res) => {
            let variable = variables[req.params.varCode];
            if (!variable) {
                this.returnDataError(res, `Cannot find variable '${varCode}' in dataSet '${dataSetCode}'`);
                return;
            }
            let query = req.params.query;
            if (["valueAtPoint", "grid", "isolines", "isobands"].indexOf(query) < 0) {
                this.returnDataError(res, `Query '${query}' not supported by raster variable  '${req.params.varCode}' in dataSet '${dataSetCode}'`);
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
            if (dataSet.config.temporality == "none") {
                let {metadata, dataFile} = await this.getVarMetadata(dataSetCode, dataSet, varCode, null);
                return {varMetadata:metadata, foundTime:null, dataFilePath:dataFile}
            }
            let {time, searchDirection} = timeHelper.normalizeTime(dataSet, searchTime);
            let tryTime = time, direction = searchDirection;
            let maxTries = dataSet.config.variablesDefaults.searchTolerance || 0;
            if (variable.searchTolerance !== undefined) maxTries = variable.searchTolerance;
            let varMetadata = null, foundTime = null, nTries = 0, dataFilePath = null;;
            let tryTime2 = null;
            do {
                let {metadata, dataFile} = await this.getVarMetadata(dataSetCode, dataSet, varCode, tryTime);
                varMetadata = metadata; dataFilePath = dataFile;
                if (!varMetadata) {
                    if (!tryTime2) {
                        tryTime2 = tryTime.clone();
                    } else {
                        let {metadata, dataFile} = await this.getVarMetadata(dataSetCode, dataSet, varCode, tryTime2);
                        varMetadata = metadata; dataFilePath = dataFile;
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
            if (varMetadata) return {varMetadata:varMetadata, foundTime:foundTime, dataFilePath:dataFilePath}
            return {varMetadata:null, foundTime:null, dataFilePath:null}
        } catch (error) {
            throw error;
        }
    }

    async getVarMetadata(dataSetCode, dataSet, varCode, time) {
        try {
            let targetFilePath;
            if (dataSet.config.temporality == "none") {
                targetFilePath = config.dataPath + "/" + dataSetCode + "/" + varCode;
            } else {
                targetFilePath = dataSetCode + "/" + timeHelper.getPathForTime(dataSetCode, dataSet, time);
                targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + timeHelper.getTimeForFileName(dataSetCode, dataSet, time);
            }
            try {
                let json = await fs.promises.readFile(targetFilePath + ".json");
                return {metadata:JSON.parse(json), dataFile:targetFilePath + "." + this.getFileExtension(dataSet)};
            } catch {
                return {metadata:null, dataFile:null};
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
                    case "grid":
                        return this.grid(dataSetCode, dataSet, varCode, params)
                    case "isolines":
                        return this.isolines(dataSetCode, dataSet, varCode, params)
                    case "isobands":
                        return this.isobands(dataSetCode, dataSet, varCode, params)
                    default:
                    throw "Format " + format + " Not Implemented";
            }
        } catch(error) {
            throw error;
        }
    }

    getFileExtension(dataSet) {
        switch(dataSet.config.dataSet.format) {
            case "grib2": return "grb2";
            case "netCDF": return "nc";
            default: throw "unknown raster file format:" + dataSet.config.dataSet.format
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

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let point = rasterHelper.normalizePoint(varMetadata, lat, lng);
            let value = await gdal.locationinfo(dataFilePath, point.x, point.y);
            
            return {
                value:value,
                searchTime:searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null,
                foundTime:foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null,
                searchPoint:{lat:lat, lng:lng},
                foundPoint:{lat:point.lat, lng:point.lng},
                metadata:varMetadata.metadata?varMetadata.metadata:{}
            }
        } catch (error) {
            throw error;
        }
    }

    async grid(dataSetCode, dataSet, varCode, params) {
        try {
            let timeParam = params.time;
            if (!timeParam) return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = timeHelper.parseTime(timeParam);
            if (!searchTime) return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            
            let nParam = params.n;
            if (nParam === undefined) return {errorCode:"data", errorText:"Missing 'n' parameter"};
            let n = parseFloat(nParam);
            if (isNaN(n)) return {errorCode:"data", errorText:"Invalid format for n: '" + nParam + "'"};
            let wParam = params.w;
            if (wParam === undefined) return {errorCode:"data", errorText:"Missing 'w' parameter"};
            let w = parseFloat(wParam);
            if (isNaN(w)) return {errorCode:"data", errorText:"Invalid format for w: '" + wParam + "'"};
            let sParam = params.s;
            if (sParam === undefined) return {errorCode:"data", errorText:"Missing 's' parameter"};
            let s = parseFloat(sParam);
            if (isNaN(s)) return {errorCode:"data", errorText:"Invalid format for s: '" + sParam + "'"};
            let eParam = params.e;
            if (eParam === undefined) return {errorCode:"data", errorText:"Missing 'e' parameter"};
            let e = parseFloat(eParam);
            if (isNaN(e)) return {errorCode:"data", errorText:"Invalid format for e: '" + eParam + "'"};

            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let searchBox = {lng0:w, lat0:s, lng1:e, lat1:n}
            let foundBox = rasterHelper.normalizeBox(varMetadata.world, searchBox);

            let data = await gdal.grid(dataFilePath, foundBox);
            // Correct foundBox to represent each value at his point (not center)
            foundBox = {
                lng0:rasterHelper.from360Lng(foundBox.lng0 + foundBox.dLng/2), 
                lat0:foundBox.lat0 + foundBox.dLat/2,
                lng1:rasterHelper.from360Lng(foundBox.lng0 + foundBox.dLng/2 + foundBox.dLng * data.ncols),
                lat1:foundBox.lat0 + foundBox.dLat/2 + foundBox.dLat * data.nrows,
                dLng:foundBox.dLng, dLat:foundBox.dLat
            }
            let value = data;

            return {
                min:value.min, max:value.max,
                ncols:value.ncols, nrows:value.nrows,
                rows:value.rows,
                searchTime:searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null,
                foundTime:foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null,
                searchBox:searchBox,
                foundBox:foundBox,
                metadata:varMetadata.metadata?varMetadata.metadata:{}
            }
        } catch (error) {
            throw error;
        }
    }

    async isolines(dataSetCode, dataSet, varCode, params) {
        try {
            let timeParam = params.time;
            if (!timeParam) return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = timeHelper.parseTime(timeParam);
            if (!searchTime) return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            
            let nParam = params.n;
            if (nParam === undefined) return {errorCode:"data", errorText:"Missing 'n' parameter"};
            let n = parseFloat(nParam);
            if (isNaN(n)) return {errorCode:"data", errorText:"Invalid format for n: '" + nParam + "'"};
            let wParam = params.w;
            if (wParam === undefined) return {errorCode:"data", errorText:"Missing 'w' parameter"};
            let w = parseFloat(wParam);
            if (isNaN(w)) return {errorCode:"data", errorText:"Invalid format for w: '" + wParam + "'"};
            let sParam = params.s;
            if (sParam === undefined) return {errorCode:"data", errorText:"Missing 's' parameter"};
            let s = parseFloat(sParam);
            if (isNaN(s)) return {errorCode:"data", errorText:"Invalid format for s: '" + sParam + "'"};
            let eParam = params.e;
            if (eParam === undefined) return {errorCode:"data", errorText:"Missing 'e' parameter"};
            let e = parseFloat(eParam);
            if (isNaN(e)) return {errorCode:"data", errorText:"Invalid format for e: '" + eParam + "'"};

            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let searchBox = {lng0:w, lat0:s, lng1:e, lat1:n}
            let foundBox = rasterHelper.normalizeBox(varMetadata.world, searchBox);

            let data = await gdal.contour(dataFilePath, foundBox, params.increment, false);

            // Correct foundBox to represent each value at his point (not center)
            foundBox = {
                lng0:rasterHelper.from360Lng(foundBox.lng0 + foundBox.dLng/2), 
                lat0:foundBox.lat0 + foundBox.dLat/2,
                lng1:rasterHelper.from360Lng(foundBox.lng0 + foundBox.dLng/2 + foundBox.dLng * foundBox.width),
                lat1:foundBox.lat0 + foundBox.dLat/2 + foundBox.dLat * foundBox.height,
                dLng:foundBox.dLng, dLat:foundBox.dLat
            }

            // Build markers
            let markers = [];
            data.geojson.features.forEach(f => {
                if (f.geometry.type == "LineString") {
                    let n = f.geometry.coordinates.length;
                    let med = parseInt((n - 0.1) / 2);
                    let p0 = f.geometry.coordinates[med], p1 = f.geometry.coordinates[med+1];
                    let lng = (p0[0] + p1[0]) / 2;
                    let lat = (p0[1] + p1[1]) / 2;
                    markers.push({lat:lat, lng:lng, value:f.properties.value});
                }
            });

            return {
                geoJson:data.geojson,
                markers:markers,
                min:data.min, max:data.max,
                increment:data.increment,
                searchTime:searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null,
                foundTime:foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null,
                searchBox:searchBox,
                foundBox:foundBox,
                metadata:varMetadata.metadata?varMetadata.metadata:{}
            }
        } catch (error) {
            if (error == "No Data") return {errorCode:"notFound", errorText:"No data"}
            throw error;
        }
    }

    async isobands(dataSetCode, dataSet, varCode, params) {
        try {
            let timeParam = params.time;
            if (!timeParam) return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = timeHelper.parseTime(timeParam);
            if (!searchTime) return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            
            let nParam = params.n;
            if (nParam === undefined) return {errorCode:"data", errorText:"Missing 'n' parameter"};
            let n = parseFloat(nParam);
            if (isNaN(n)) return {errorCode:"data", errorText:"Invalid format for n: '" + nParam + "'"};
            let wParam = params.w;
            if (wParam === undefined) return {errorCode:"data", errorText:"Missing 'w' parameter"};
            let w = parseFloat(wParam);
            if (isNaN(w)) return {errorCode:"data", errorText:"Invalid format for w: '" + wParam + "'"};
            let sParam = params.s;
            if (sParam === undefined) return {errorCode:"data", errorText:"Missing 's' parameter"};
            let s = parseFloat(sParam);
            if (isNaN(s)) return {errorCode:"data", errorText:"Invalid format for s: '" + sParam + "'"};
            let eParam = params.e;
            if (eParam === undefined) return {errorCode:"data", errorText:"Missing 'e' parameter"};
            let e = parseFloat(eParam);
            if (isNaN(e)) return {errorCode:"data", errorText:"Invalid format for e: '" + eParam + "'"};

            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let searchBox = {lng0:w, lat0:s, lng1:e, lat1:n}
            let foundBox = rasterHelper.normalizeBox(varMetadata.world, searchBox);

            let data = await gdal.contour(dataFilePath, foundBox, params.increment, true);

            // Correct foundBox to represent each value at his point (not center)
            foundBox = {
                lng0:rasterHelper.from360Lng(foundBox.lng0 + foundBox.dLng/2), 
                lat0:foundBox.lat0 + foundBox.dLat/2,
                lng1:rasterHelper.from360Lng(foundBox.lng0 + foundBox.dLng/2 + foundBox.dLng * foundBox.width),
                lat1:foundBox.lat0 + foundBox.dLat/2 + foundBox.dLat * foundBox.height,
                dLng:foundBox.dLng, dLat:foundBox.dLat
            }

            return {
                geoJson:data.geojson,
                min:data.min, max:data.max,
                increment:data.increment,
                searchTime:searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null,
                foundTime:foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null,
                searchBox:searchBox,
                foundBox:foundBox,
                metadata:varMetadata.metadata?varMetadata.metadata:{}
            }
        } catch (error) {
            if (error == "No Data") return {errorCode:"notFound", errorText:"No data"}
            throw error;
        }
    }
}

module.exports = RasterServer.instance;