const AbstractServer = require("./AbstractServer");
const timeHelper = require("../helpers/TimeHelper");
const rasterHelper = require("../helpers/RasterHelper");
const config = require("../Config");
const fs = require("fs");
const gdal = require("../GDAL");
const { trace } = require("console");
const fetch = require("node-fetch");
const _eval = require("eval");

class RasterServer extends AbstractServer {
    static get instance() {
        if (RasterServer.singleton) return RasterServer.singleton;
        RasterServer.singleton = new RasterServer();
        return RasterServer.singleton;
    }

    registerEndPoints(app, dataSetCode) {
        if (!this.formulaRegistered) {
            // Endpoint comun a todos los dataSets
            this.formulaRegistered = true;
            app.post("/formula", (req, res) => {this.resolveFormula(req, res)});
        }        
        app.get("/" + dataSetCode + "/:varCode/:query", (req, res) => {
            let dataSet = config.serverConfig.dataSets[dataSetCode];
            let variables = dataSet.config.variables || [];
            let variable = variables[req.params.varCode];
            if (!variable) {
                this.returnDataError(res, `Cannot find variable '${varCode}' in dataSet '${dataSetCode}'`);
                return;
            }
            let query = req.params.query;
            let supported = ["valueAtPoint", "grid", "isolines", "isobands", "timeSerie"];
            if (variable.vector) supported.push("vectorsGrid");
            if (supported.indexOf(query) < 0) {
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
                .catch(error => {
                    console.error(error);
                    this.returnInternalError(res, error.toString())
                })
        })
    }

    async findVarMetadata(dataSetCode, dataSet, varCode, searchTime, level) {
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
                let {metadata, dataFile} = await this.getVarMetadata(dataSetCode, dataSet, varCode, tryTime, level);
                varMetadata = metadata; dataFilePath = dataFile;
                if (!varMetadata) {
                    if (!tryTime2) {
                        tryTime2 = tryTime.clone();
                    } else {
                        let {metadata, dataFile} = await this.getVarMetadata(dataSetCode, dataSet, varCode, tryTime2, level);
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

    async getVarMetadata(dataSetCode, dataSet, varCode, time, level) {
        try {
            let targetFilePath, levelPart = (level === undefined?"":"_" + level);            
            if (dataSet.config.temporality == "none") {
                targetFilePath = config.dataPath + "/" + dataSetCode + "/" + varCode + levelPart;
            } else {
                targetFilePath = dataSetCode + "/" + timeHelper.getPathForTime(dataSetCode, dataSet, time);
                targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + levelPart + "_" + timeHelper.getTimeForFileName(dataSetCode, dataSet, time);
            }
            //console.log("buscando:", targetFilePath);
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
                case "timeSerie":
                    return this.timeSerie(dataSetCode, dataSet, varCode, params)
                case "grid":
                    return this.grid(dataSetCode, dataSet, varCode, params)
                case "isolines":
                    return this.isolines(dataSetCode, dataSet, varCode, params)
                case "isobands":
                    return this.isobands(dataSetCode, dataSet, varCode, params)
                case "vectorsGrid":
                    return this.vectorsGrid(dataSetCode, dataSet, varCode, params)
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
            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
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
            let level;
            if (variable.levels && variable.levels.descriptions.length > 1) {
                level = params.level;
                if (level === undefined) return {errorCode:"data", errorText:"Variable " + varCode + " in dataSet " + dataSetCode + " requires level argument"}
                level = parseInt(level);
                if (isNaN(level) && level < 0 || level > (variable.levels.descriptions.lengh -1)) return {errorCode:"data", errorText:"Invalid level value for Variable " + varCode + " in dataSet " + dataSetCode}
            }

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime, level)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let point = rasterHelper.normalizePoint(varMetadata, lat, lng);
            let value = await gdal.locationinfo(dataFilePath, point.x, point.y);
            if (varMetadata && varMetadata.metadata && varMetadata.metadata.noDataValue !== undefined && varMetadata.metadata.noDataValue == value) {
                return {errorCode:"notFound", errorText:"No data"}
            }
            
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

    async timeSerie(dataSetCode, dataSet, varCode, params) {
        try {
            let startTimeParam = params.startTime;
            if (!startTimeParam) return {errorCode:"data", errorText:"Missing 'startTime' parameter"};
            let startTime = timeHelper.parseTime(startTimeParam);
            if (!startTime) return {errorCode:"data", errorText:"Invalid time format for time: '" + startTimeParam + "'"};

            let endTimeParam = params.endTime;
            if (!endTimeParam) return {errorCode:"data", errorText:"Missing 'endTime' parameter"};
            let endTime = timeHelper.parseTime(endTimeParam);
            if (!endTime) return {errorCode:"data", errorText:"Invalid time format for time: '" + endTimeParam + "'"};

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
            let level;
            if (variable.levels && variable.levels.descriptions.length > 1) {
                level = params.level;
                if (level === undefined) return {errorCode:"data", errorText:"Variable " + varCode + " in dataSet " + dataSetCode + " requires level argument"}
                level = parseInt(level);
                if (isNaN(level) && level < 0 || level > (variable.levels.descriptions.lengh -1)) return {errorCode:"data", errorText:"Invalid level value for Variable " + varCode + " in dataSet " + dataSetCode}
            }

            let time = startTime.clone(), point, queries=[];
            let noDataValue = null;
            do {
                let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, time, level)
                if (varMetadata) {
                    point = point || rasterHelper.normalizePoint(varMetadata, lat, lng);
                    queries.push({status:"pending", time:foundTime?foundTime.valueOf():time.valueOf(), dataFilePath, x:point.x, y:point.y})
                    if (noDataValue === null && varMetadata && varMetadata.metadata && varMetadata.metadata.noDataValue) noDataValue = varMetadata.metadata.noDataValue;
                }
                if (!dataSet.config.temporality || dataSet.config.temporality == "none") {
                    time = endTime.clone();
                } else {
                    time = timeHelper.incTime(dataSet, time, 1);
                }
            } while (time.valueOf() < endTime.valueOf());
            if (!queries.length) return [];
            let ret = await (new Promise(resolve => {
                for (let i=0; i<10; i++) this.startPointQuery(queries, _ => {
                    let ret = queries.reduce((list, q) => {
                        if (q.status == "ok") list.push({time:q.time, value:q.value})
                        return list;
                    }, [])
                    resolve(ret);
                }, noDataValue);
            }))
            return ret;
        } catch (error) {
            throw error;
        }
    }

    startPointQuery(queries, onFinish, noDataValue) {
        let q = queries.find(q => q.status == "pending");
        if (!q) return;
        q.status = "running";
        gdal.locationinfo(q.dataFilePath, q.x, q.y)
            .then(value => {
                if (value && value != noDataValue && Math.abs(value) < 9e+34) {
                    q.value = value;
                    q.status = "ok";
                } else {
                    q.value = "nodata";
                }
                let nPending = queries.reduce((n, q) => (n + (q.status == "pending"?1:0)), 0);
                if (nPending) this.startPointQuery(queries, onFinish, noDataValue);
                else onFinish();
            })
            .catch(error => {
                console.error(error);
                q.status = "error";
                let nPending = queries.reduce((n, q) => (n + (q.status == "pending"?1:0)), 0);
                if (nPending) this.startPointQuery(queries, onFinish);
                else onFinish();
            })
    }

    async grid(dataSetCode, dataSet, varCode, params, gridConfig) {
        try {
            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            
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
            let level;
            if (variable.levels && variable.levels.descriptions.length > 1) {
                level = params.level;
                if (level === undefined) return {errorCode:"data", errorText:"Variable " + varCode + " in dataSet " + dataSetCode + " requires level argument"}
                level = parseInt(level);
                if (isNaN(level) && level < 0 || level > (variable.levels.descriptions.lengh -1)) return {errorCode:"data", errorText:"Invalid level value for Variable " + varCode + " in dataSet " + dataSetCode}
            }

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime, level)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let forcedDLat = parseFloat(params.dLat);
            let forcedDLng = parseFloat(params.dLng);
            if (isNaN(forcedDLat)) {
                let margin;
                if (params.margin && !isNaN(parseFloat(params.margin))) margin = parseFloat(params.margin);
                let searchBox = {lng0:w, lat0:s, lng1:e, lat1:n}
                if (margin) {
                    searchBox.lng0 -= varMetadata.world.dLng * margin;
                    searchBox.lat0 -= varMetadata.world.dLat * margin;
                    searchBox.lng1 += varMetadata.world.dLng * margin;
                    searchBox.lat1 += varMetadata.world.dLat * margin;
                }
                let foundBox = rasterHelper.normalizeBox(varMetadata.world, searchBox);

                if (!gridConfig) gridConfig = dataSet.config.grid;
                let maxWidth = 200, maxHeight = 200, resamplig = "nearest";
                if (gridConfig && gridConfig.maxWidth) maxWidth = gridConfig.maxWidth;
                if (gridConfig && gridConfig.maxHeight) maxHeight = gridConfig.maxHeight;
                if (gridConfig && gridConfig.resamplig) resamplig = gridConfig.resamplig;

                let data = await gdal.grid(dataFilePath, foundBox, maxWidth, maxHeight, resamplig);
                // Apply corrections if size was adjusted
                foundBox.dLng = data.newDLng;
                foundBox.dLat = data.newDLat;
                // Correct foundBox to represent each value at his point (not center)
                foundBox = {
                    lng0:foundBox.lng0 + foundBox.dLng/2, 
                    lat0:foundBox.lat0 + foundBox.dLat/2,
                    lng1:foundBox.lng0 + foundBox.dLng/2 + foundBox.dLng * data.ncols,
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
                    metadata:varMetadata.metadata?varMetadata.metadata:{},
                    warnings:data.warnings
                }
            } else {
                let srcBox = {lat0:s, lat1:n, lng0:w, lng1:e, dLat:forcedDLat, dLng:forcedDLng}
                let data = await gdal.forcedGrid(dataFilePath, srcBox, "bilinear", -9999999999);
                return {
                    min:data.min, max:data.max,ncols:data.ncols, nrows:data.nrows,
                    rows:data.rows,
                    searchTime:searchTime?{msUTC:searchTime.valueOf(), formatted:searchTime.format("YYYY-MM-DD HH:mm")}:null,
                    foundTime:foundTime?{msUTC:foundTime.valueOf(), formatted:foundTime.format("YYYY-MM-DD HH:mm")}:null,
                    foundBox:srcBox,
                    metadata:varMetadata.metadata?varMetadata.metadata:{}
                }
            }
        } catch (error) {
            throw error;
        }
    }

    async isolines(dataSetCode, dataSet, varCode, params) {
        try {
            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            
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
            let fixedLevels = params.fixedLevels?params.fixedLevels:null;

            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}
            let level;
            if (variable.levels && variable.levels.descriptions.length > 1) {
                level = params.level;
                if (level === undefined) return {errorCode:"data", errorText:"Variable " + varCode + " in dataSet " + dataSetCode + " requires level argument"}
                level = parseInt(level);
                if (isNaN(level) && level < 0 || level > (variable.levels.descriptions.lengh -1)) return {errorCode:"data", errorText:"Invalid level value for Variable " + varCode + " in dataSet " + dataSetCode}
            }

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime, level)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let searchBox = {lng0:w, lat0:s, lng1:e, lat1:n}
            let foundBox = rasterHelper.normalizeBox(varMetadata.world, searchBox);

            let maxWidth = 200, maxHeight = 200, resampling = "nearest";
            if (dataSet.config.grid && dataSet.config.contour.maxWidth) maxWidth = dataSet.config.contour.maxWidth;
            if (dataSet.config.grid && dataSet.config.contour.maxHeight) maxHeight = dataSet.config.contour.maxHeight;
            if (dataSet.config.grid && dataSet.config.contour.resamplig) resampling = dataSet.config.contour.resamplig;

            let data = await gdal.contour(dataFilePath, foundBox, params.increment, false, maxWidth, maxHeight, resampling, fixedLevels);

            // Apply corrections if size was adjusted
            foundBox.dLng = data.newDLng;
            foundBox.dLat = data.newDLat;

            // Correct foundBox to represent each value at his point (not center)
            foundBox = {
                lng0:foundBox.lng0 + foundBox.dLng/2, 
                lat0:foundBox.lat0 + foundBox.dLat/2,
                lng1:foundBox.lng0 + foundBox.dLng/2 + foundBox.dLng * foundBox.width,
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
                metadata:varMetadata.metadata?varMetadata.metadata:{},
                warnings:data.warnings
            }
        } catch (error) {
            if (error == "No Data") return {errorCode:"notFound", errorText:"No data"}
            throw error;
        }
    }

    async isobands(dataSetCode, dataSet, varCode, params) {
        try {
            let timeParam = dataSet.config.temporality == "none"?null:params.time;
            if (!timeParam && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Missing 'time' parameter"};
            let searchTime = dataSet.config.temporality == "none"?null:timeHelper.parseTime(timeParam);
            if (!searchTime && dataSet.config.temporality != "none") return {errorCode:"data", errorText:"Invalid time format for time: '" + timeParam + "'"};
            
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
            let fixedLevels = params.fixedLevels?params.fixedLevels:null;

            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}
            let level;
            if (variable.levels && variable.levels.descriptions.length > 1) {
                level = params.level;
                if (level === undefined) return {errorCode:"data", errorText:"Variable " + varCode + " in dataSet " + dataSetCode + " requires level argument"}
                level = parseInt(level);
                if (isNaN(level) && level < 0 || level > (variable.levels.descriptions.lengh -1)) return {errorCode:"data", errorText:"Invalid level value for Variable " + varCode + " in dataSet " + dataSetCode}
            }

            let {varMetadata, foundTime, dataFilePath} = await this.findVarMetadata(dataSetCode, dataSet, varCode, searchTime, level)
            if (!varMetadata) return {errorCode:"notFound", errorText:"No data"}

            let searchBox = {lng0:w, lat0:s, lng1:e, lat1:n}
            let foundBox = rasterHelper.normalizeBox(varMetadata.world, searchBox);

            let maxWidth = 200, maxHeight = 200, resampling = "nearest";
            if (dataSet.config.grid && dataSet.config.contour.maxWidth) maxWidth = dataSet.config.contour.maxWidth;
            if (dataSet.config.grid && dataSet.config.contour.maxHeight) maxHeight = dataSet.config.contour.maxHeight;
            if (dataSet.config.grid && dataSet.config.contour.resamplig) resampling = dataSet.config.contour.resamplig;

            let data = await gdal.contour(dataFilePath, foundBox, params.increment, true, maxWidth, maxHeight, resampling, fixedLevels);

            // Apply corrections if size was adjusted
            foundBox.dLng = data.newDLng;
            foundBox.dLat = data.newDLat;

            // Correct foundBox to represent each value at his point (not center)
            foundBox = {
                lng0:foundBox.lng0 + foundBox.dLng/2, 
                lat0:foundBox.lat0 + foundBox.dLat/2,
                lng1:foundBox.lng0 + foundBox.dLng/2 + foundBox.dLng * foundBox.width,
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
                metadata:varMetadata.metadata?varMetadata.metadata:{},
                warnings:data.warnings
            }
        } catch (error) {
            if (error == "No Data") return {errorCode:"notFound", errorText:"No data"}
            throw error;
        }
    }
    
    async vectorsGrid(dataSetCode, dataSet, varCode, params) {
        try {
            let variable = dataSet.config.variables[varCode];
            if (!variable) return {errorCode:"data", errorText:"Cannot find variable " + varCode + " in dataSet " + dataSetCode}
            if (!variable.vector || !variable.vector.uComponent || !variable.vector.vComponent) {
                return {errorCode:"data", errorText:"No vector data associated with variable " + varcode}
            }
            let pU = this.grid(dataSetCode, dataSet, variable.vector.uComponent, params, dataSet.config.vectorsGrid);
            let pV = this.grid(dataSetCode, dataSet, variable.vector.vComponent, params, dataSet.config.vectorsGrid);
            let [dataU, dataV] = await Promise.all([pU, pV]);
            if (dataU.errorCode) return dataU;
            if (dataV.errorCode) return dataV;
            let ret = dataU;
            ret.rowsU = dataU.rows;
            delete ret.rows;
            ret.rowsV = dataV.rows;
            // calculate min/max magnitudes
            let min, max;
            for (let iRow=0; iRow<ret.nrows; iRow++) {
                for (let iCol=0; iCol<ret.ncols; iCol++) {
                    let u = ret.rowsU[iRow][iCol];
                    let v = ret.rowsV[iRow][iCol];
                    if (u !== undefined && v !== undefined) {
                        let m = Math.sqrt(u*u + v*v);
                        if (min === undefined || m < min) min = m;
                        if (max === undefined || m > max) max = m;
                    }
                }
            }
            ret.min = min;
            ret.max = max;
            return ret;
        } catch (error) {
            trace(error);
            if (error == "No Data") return {errorCode:"notFound", errorText:"No data"}
            throw error;
        }
    }    

    _getJSON(url, args) {
        let urlArgs = "";
        for (const argName in args) {
            if (args[argName] !== undefined) {
                urlArgs = urlArgs?(urlArgs + "&"):"?";
                urlArgs += argName + "=" + encodeURIComponent(args[argName]);
            }
        }
        return new Promise((resolve, reject) => {
            fetch(url + urlArgs)
                .then(res => {
                    if (res.status != 200) {
                        res.text()
                            .then(txt => reject(txt))
                            .catch(_ => reject(res.statusText))
                        return;
                    }
                    res.json()
                        .then(json => {
                            resolve(json)
                        }).catch(err => {
                            reject(err)
                        })
                })
                .catch(err => {
                    reject(err.name == "AbortError"?"aborted":err)
                });
        })
    }    

    async resolveFormula(req, res) {
        let formulaType = req.body.formulaType;
        if (formulaType == "serverJSPoint") {
            this.resolveFormulaJSPoint(req, res);
        } else if (formulaType == "serverPyDataSet") {
            this.resolveFormulaPyDataSet(req, res);
        } else {
            this.returnInternalError(res, "Tipo de Fórmula " + formulaType + " No Manejado");
        }
    }
    async resolveFormulaJSPoint(req, res) {
        try {
            let {formula, sources, n, w, s, e, dLat, dLng, nrows, ncols} = req.body;
            let promises = [];
            for (let source of sources) {
                let url = source.geoServer + "/" + source.dataSet + "/" + source.variable + "/grid";
                let time = req.body.time;
                if (source.time.type == "map") {
                    const offsets = {"minutes":1000 * 60, "hours":1000 * 60 * 60, "days":1000 * 60 * 60 * 24}
                    time += source.time.offset * offsets[source.time.unit];
                } else {
                    time = source.time.ms;
                }
                promises.push(this._getJSON(url, {
                    time, n, w ,s, e, margin:0, level: source.level, dLat, dLng
                }))
            }

            let datas = await Promise.all(promises);
            if (!datas)  throw "No Data - 2";
            let sourcesData = {};
            let metadatas = {}, args = {};
            let foundBox = {lng0: w, lat0: s, lng1: e, lat1: n, dLat, dLng, nrows, ncols};
            let i=0;
            for (let source of sources) {
                let sData = datas[i];
                let metadata = {foundTime:sData.foundTime};
                if (sData.metadata && sData.metadata.modelExecution) {
                    metadata.modelExecution = sData.metadata.modelExecution;
                }
                metadatas[source.code] = metadata;
                if (sData.nrows != foundBox.nrows || sData.ncols != foundBox.ncols) {
                    console.error("Estructura de respuesta inválida");
                    console.error("  Esperado: (" + foundBox.nrows + ", " + foundBox.ncols + ")");
                    console.error("  Recibido: (" + sData.nrows + ", " + sData.ncols + ")");
                    throw "Datos Incompatibles";
                }
                sourcesData[source.code] = sData;
                args["min_" + source.code] = sData.min;
                args["max_" + source.code] = sData.max;
                i++;            
            }

            global["rgbEncode"] = function(r, g, b) {
                r = parseInt(256 * r); g = parseInt(256 * g); b = parseInt(256 * b);
                r = Math.min(r, 255); g = Math.min(g, 255); b = Math.min(b, 255);
                return 65536 * r + 256 * g + b;
            }
            global["rgbaEncode"] = function(r, g, b, a) {
                r = parseInt(256 * r); g = parseInt(256 * g); b = parseInt(256 * b); a = parseInt(100 * a); 
                r = Math.min(r, 255); g = Math.min(g, 255); b = Math.min(b, 255); a = Math.min(a, 99);
                let v = 65536 * 256 * r + 65536 * g + 256 * b + a;
                return v;
            }
            // Construir matriz de resultados
            let z = eval(formula + "\n(z);");
            let minDataLng, maxDataLng, minDataLat, maxDataLat;
            let min, max;
            let rows = [];
            for (let r=0; r<foundBox.nrows; r++) {
                let row = [];
                for (let c=0; c<foundBox.ncols; c++) {
                    let lat = foundBox.lat0 + r * foundBox.dLat;
                    let lng = foundBox.lng0 + c * foundBox.dLng;
                    // Llenar variables globales
                    args["lat"] = lat;
                    args["lng"] = lng;
                    for (let source of sources) {
                        let sRows = sourcesData[source.code].rows;
                        let ndv = undefined;
                        if (sourcesData[source.code].metadata) ndv = sourcesData[source.code].metadata.noDataValue;
                        let v = sRows[r][c];
                        if (v == ndv) v = null;
                        args[source.code] = v;
                    }
                    let v;
                    try {
                        //v = _eval(formula + "\n(z())", "formula", jsScope);
                        v = z(args);
                    } catch(error) {
                        this.dataError = "Error en Fórmula:" + error.toString();
                        this.resolving = false;
                        this.returnDataError(res, this.dataError);
                        return;
                    }
                    if (v !== null && v !== undefined) {
                        min = min === undefined || v < min?v:min;
                        max = max === undefined || v > max?v:max;
                        minDataLng = minDataLng === undefined || lng < minDataLng?lng:minDataLng;
                        maxDataLng = maxDataLng === undefined || lng > maxDataLng?lng:maxDataLng;
                        minDataLat = minDataLat === undefined || lat < minDataLat?lat:minDataLat;
                        maxDataLat = maxDataLat === undefined || lat > maxDataLat?lat:maxDataLat;
                    }
                    row.push(v);
                }
                rows.push(row);
            }

            let ret = {min, max, foundBox, rows, nrows, ncols, dataBox:{
                w: minDataLng, n: maxDataLat, e: maxDataLng, s: minDataLat
            }, metadatas};
            this.returnJson(res, ret);            
        } catch(error) {
            console.error(error);
            this.returnInternalError(res, error.toString());
        }
    }

    async resolveFormulaPyDataSet(req, res) {
        try {
            let {formula, sources, n, w, s, e, dLat, dLng, nrows, ncols} = req.body;
            let promises = [];
            for (let source of sources) {
                let url = source.geoServer + "/" + source.dataSet + "/" + source.variable + "/grid";
                let time = req.body.time;
                if (source.time.type == "map") {
                    const offsets = {"minutes":1000 * 60, "hours":1000 * 60 * 60, "days":1000 * 60 * 60 * 24}
                    time += source.time.offset * offsets[source.time.unit];
                } else {
                    time = source.time.ms;
                }
                promises.push(this._getJSON(url, {
                    time, n, w ,s, e, margin:0, level: source.level, dLat, dLng
                }))
            }

            let datas = await Promise.all(promises);
            if (!datas)  throw "No Data - 2";
            let sourcesData = {};
            let metadatas = {}, args = {};
            let foundBox = {lng0: w, lat0: s, lng1: e, lat1: n, dLat, dLng, nrows, ncols};
            let i=0;
            for (let source of sources) {
                let sData = datas[i];
                let metadata = {foundTime:sData.foundTime};
                if (sData.metadata && sData.metadata.modelExecution) {
                    metadata.modelExecution = sData.metadata.modelExecution;
                }
                metadatas[source.code] = metadata;
                if (sData.nrows != foundBox.nrows || sData.ncols != foundBox.ncols) {
                    console.error("Estructura de respuesta inválida");
                    console.error("  Esperado: (" + foundBox.nrows + ", " + foundBox.ncols + ")");
                    console.error("  Recibido: (" + sData.nrows + ", " + sData.ncols + ")");
                    throw "Datos Incompatibles";
                }
                sourcesData[source.code] = sData;
                args["min_" + source.code] = sData.min;
                args["max_" + source.code] = sData.max;
                i++;            
            }

            global["rgbEncode"] = function(r, g, b) {
                r = parseInt(256 * r); g = parseInt(256 * g); b = parseInt(256 * b);
                r = Math.min(r, 255); g = Math.min(g, 255); b = Math.min(b, 255);
                return 65536 * r + 256 * g + b;
            }
            global["rgbaEncode"] = function(r, g, b, a) {
                r = parseInt(256 * r); g = parseInt(256 * g); b = parseInt(256 * b); a = parseInt(100 * a); 
                r = Math.min(r, 255); g = Math.min(g, 255); b = Math.min(b, 255); a = Math.min(a, 99);
                let v = 65536 * 256 * r + 65536 * g + 256 * b + a;
                return v;
            }
            // Construir matriz de resultados
            let z = eval(formula + "\n(z);");
            let minDataLng, maxDataLng, minDataLat, maxDataLat;
            let min, max;
            let rows = [];
            for (let r=0; r<foundBox.nrows; r++) {
                let row = [];
                for (let c=0; c<foundBox.ncols; c++) {
                    let lat = foundBox.lat0 + r * foundBox.dLat;
                    let lng = foundBox.lng0 + c * foundBox.dLng;
                    // Llenar variables globales
                    args["lat"] = lat;
                    args["lng"] = lng;
                    for (let source of sources) {
                        let sRows = sourcesData[source.code].rows;
                        let ndv = undefined;
                        if (sourcesData[source.code].metadata) ndv = sourcesData[source.code].metadata.noDataValue;
                        let v = sRows[r][c];
                        if (v == ndv) v = null;
                        args[source.code] = v;
                    }
                    let v;
                    try {
                        //v = _eval(formula + "\n(z())", "formula", jsScope);
                        v = z(args);
                    } catch(error) {
                        this.dataError = "Error en Fórmula:" + error.toString();
                        this.resolving = false;
                        this.returnDataError(res, this.dataError);
                        return;
                    }
                    if (v !== null && v !== undefined) {
                        min = min === undefined || v < min?v:min;
                        max = max === undefined || v > max?v:max;
                        minDataLng = minDataLng === undefined || lng < minDataLng?lng:minDataLng;
                        maxDataLng = maxDataLng === undefined || lng > maxDataLng?lng:maxDataLng;
                        minDataLat = minDataLat === undefined || lat < minDataLat?lat:minDataLat;
                        maxDataLat = maxDataLat === undefined || lat > maxDataLat?lat:maxDataLat;
                    }
                    row.push(v);
                }
                rows.push(row);
            }

            let ret = {min, max, foundBox, rows, nrows, ncols, dataBox:{
                w: minDataLng, n: maxDataLat, e: maxDataLng, s: minDataLat
            }, metadatas};
            this.returnJson(res, ret);            
        } catch(error) {
            console.error(error);
            this.returnInternalError(res, error.toString());
        }
    }
}

module.exports = RasterServer.instance;