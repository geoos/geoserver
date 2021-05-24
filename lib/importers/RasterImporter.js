const gdal = require("../GDAL");
const log = require("../Logs");
const config = require("../Config");
const fs = require("fs");
const rasterHelper = require("../helpers/RasterHelper");
const timeHelper = require("../helpers/TimeHelper");
const filesHelper = require("../helpers/FilesHelper");


class RasterImporter {
    static isRasterFile(fileName) {
        let p = fileName.toLowerCase();
        return p.endsWith(".grb2") || p.endsWith(".nc");
    }
    static createImporter(filePath, serverConfig, dataSetCode, dataSet) {
        if (dataSet.config.dataSet.format == "grib2") {
            if (!filePath.toLowerCase().endsWith(".grb2")) throw "Expected file extension for dataSet '" + dataSetCode + "' is '.grb2'";
            //return new (require("./GRIB2Importer"))(filePath, serverConfig, dataSetCode, dataSet, "grb2", "GRIB2 Raster Importer");
            return new RasterImporter(filePath, serverConfig, dataSetCode, dataSet, "grb2", "GRIB2 Raster Importer");
        } else if (dataSet.config.dataSet.format == "netCDF") {
            if (!filePath.toLowerCase().endsWith(".nc")) throw "Expected file extension for dataSet '" + dataSetCode + "' is '.nc'";
            //return new (require("./NCImporter"))(filePath, serverConfig, dataSetCode, dataSet, "nc", "NetCDF Raster Importer");
            return new RasterImporter(filePath, serverConfig, dataSetCode, dataSet, "nc", "NetCDF Raster Importer");
        }
        return null;
    }

    static async importFile(dataSetCode, dataSet, fileName, filePath, serverConfig) {
        try {            
            let importer = RasterImporter.createImporter(filePath, serverConfig, dataSetCode, dataSet);
            if (!importer) throw "No Raster importer for file " + filePath;
            log.debug(`Importing ${fileName} using ${importer.name}`);
            await importer.import();
            log.debug(`File Imported: ${fileName}`);
        } catch(error) {
            throw error;
        }

    }
    constructor(filePath, serverConfig, dataSetCode, dataSet, extension, name) {
        this.filePath = filePath;
        this.serverConfig = serverConfig;
        this.dataSetCode = dataSetCode
        this.dataSet = dataSet;
        this.extension = extension;
        this.name = name;
    }

    rebuildWorld(info) {
        this.world = {
            lng0:info.cornerCoordinates.upperLeft[0],
            lat1:info.cornerCoordinates.upperLeft[1],
            lng1:info.cornerCoordinates.lowerRight[0],
            lat0:info.cornerCoordinates.lowerRight[1]
        }
        this.world.dLng = (this.world.lng1 - this.world.lng0) / info.size[0];
        this.world.dLat = (this.world.lat1 - this.world.lat0) / info.size[1];
        this.world.width = info.size[0];
        this.world.height = info.size[1];
    }

    async readFileInfo() {
        try {
            this.info = await gdal.info(this.filePath, false);
            this.rebuildWorld(this.info);
        } catch (error) {
            throw error;
        }
    }

    getFileName() {
        let p = this.filePath.lastIndexOf("/");
        return this.filePath.substr(p+1);
    }
    getRandomFilePath(extension) {
        const chars = "abcdefghijklmnopqrstuvwxyz01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let st = "tmp_";
        for (let i=0; i<15; i++) {
            st += chars[parseInt(chars.length * Math.random())];
        }
        return config.dataPath + "/tmp/" + st + "." + extension;
    }

    async indexFile(filePath, extraMetadata) {
        try {
            let metadata = {}
            let info = await gdal.info(filePath, true);
            metadata.world = {
                lng0:info.cornerCoordinates.upperLeft[0],
                lat1:info.cornerCoordinates.upperLeft[1],
                lng1:info.cornerCoordinates.lowerRight[0],
                lat0:info.cornerCoordinates.lowerRight[1]
            }
            if (metadata.world.lng0 == metadata.world.lng1) metadata.world.lng0 -= 360;
            metadata.world.width = info.size[0];
            metadata.world.height = info.size[1];
            metadata.world.dLng = (metadata.world.lng1 - metadata.world.lng0) / metadata.world.width;
            metadata.world.dLat = (metadata.world.lat1 - metadata.world.lat0) / metadata.world.height;

            metadata.min = info.bands[0].computedMin;
            metadata.max = info.bands[0].computedMax;

            if (extraMetadata) metadata.metadata = extraMetadata;

            let p = filePath.lastIndexOf(".");
            let metadataFileName = filePath.substr(0,p) + ".json";
            await fs.promises.writeFile(metadataFileName, JSON.stringify(metadata));
        } catch(error) {
            throw error;
        }
    }

    buidVars(obj, appendTo = {}) {
        Object.keys(obj).forEach(k => {
            let v = obj[k];
            if (typeof v == "object") {
                this.buidVars(v, appendTo);
            } else if (!Array.isArray(v)) {
                appendTo[k] = v;
            }
        });
        return appendTo;
    }

    passSelector(selector, bandVars) {
        let keys = Object.keys(selector || {});
        for (let i=0; i<keys.length; i++) {
            const key = keys[i];
            if (selector[key] != bandVars[key]) return false;
        }
        return true;
    }

    findVariablesForBand(band) {
        const bandVars = this.buidVars(band);
        let vars = [];
        Object.keys(this.dataSet.config.variables).forEach(varCode => {
            const variable = this.dataSet.config.variables[varCode];
            if (!variable.calculated && this.passSelector(variable.selector, bandVars)) {
                if (variable.levels) {
                    let v = bandVars[variable.levels.attribute];
                    if (v) {
                        const level = variable.levels.values.indexOf(v);
                        if (level >= 0) {
                            vars.push({variable:varCode, level})
                        }
                    }
                } else {
                    vars.push({variable:varCode, level:undefined})
                }
            }
        })
        return vars;
    }

    async importVariable(band, varCode, varLevel, fileTime, datasetName) {
        try {
            let variable = this.dataSet.config.variables[varCode];
            log.debug("  -> Importing " + varCode + (varLevel !== undefined?" [" + variable.levels.descriptions[varLevel] + "]":""));
            let srcBox;
            let dsLimits = this.dataSet.config.clippingArea;
            if (dsLimits) {
                let limits = {
                    lng0:dsLimits.w, lat0:dsLimits.s,
                    lng1:dsLimits.e, lat1:dsLimits.n
                }
                srcBox = rasterHelper.normalizeBox(this.world, limits);
            }
            let tmpImportedFormat = this.getRandomFilePath(this.extension);
            await gdal.translate(datasetName?datasetName:this.filePath, tmpImportedFormat, [band.band], srcBox, true, "Float64");
            if (variable.transform) {
                log.debug("  -> Applying transformation: " + variable.transform);
                // gdal_calc.py canot produce grb2 file. Create tiff and translate to grb2
                let transformedTIFF = this.getRandomFilePath("tiff");
                await gdal.calc([["Z", tmpImportedFormat]], transformedTIFF, variable.transform);
                await fs.promises.unlink(tmpImportedFormat);
                let transformedImportedFormat = this.getRandomFilePath(this.extension);
                await gdal.translate(transformedTIFF, transformedImportedFormat, null, null, false);
                await fs.promises.unlink(transformedTIFF);
                tmpImportedFormat = transformedImportedFormat;
            }
            let targetFilePath = this.dataSetCode + "/" + timeHelper.getPathForTime(this.dataSetCode, this.dataSet, fileTime);
            await filesHelper.ensureDir(config.dataPath, targetFilePath);
            if (varLevel === undefined) {
                if (this.dataSet.config.temporality != "none") {
                    targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime) + "." + this.extension;
                } else {
                    targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "." + this.extension;
                }
            } else {
                if (this.dataSet.config.temporality != "none") {
                    targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + varLevel + "_" + timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime) + "." + this.extension;
                } else {
                    targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + varLevel + "." + this.extension;
                }
            }
            await fs.promises.rename(tmpImportedFormat, targetFilePath);
            let metadata = {};
            if (band.noDataValue !== undefined) {
                metadata.noDataValue = band.noDataValue;
            }
            if (band.metadata && band.metadata[""]) {
                let foreSec = band.metadata[""].GRIB_FORECAST_SECONDS;
                if (foreSec && foreSec.endsWith(" sec")) {
                    let sec = parseInt(foreSec.split(" ")[0]);
                    if (!isNaN(sec)) {
                        let modelExecution = fileTime.clone().subtract(sec, "seconds");
                        metadata.modelExecution = {msUTC:modelExecution.valueOf(), formatted:modelExecution.format("YYYY-MM-DD HH:mm")}
                    }
                }
            }
            await this.indexFile(targetFilePath, metadata);
        } catch (error) {
            throw error;
        }
    }
    async import() {
        try {
            let fileTime = timeHelper.getTimeInFileName(this.dataSetCode, this.dataSet, this.getFileName());
            timeHelper.validateTimeForDataSet(this.dataSetCode, this.dataSet, fileTime);
            await this.readFileInfo();
            // search for datasets
            let datasetsInfo = [], datasetsNames = [], metadata = this.info.metadata;
            if (metadata && metadata.SUBDATASETS) {
                let n=1, found = true;
                do {
                    let name = metadata.SUBDATASETS["SUBDATASET_" + n + "_NAME"]
                    if (name) {
                        datasetsInfo.push(await gdal.info(name))
                        datasetsNames.push(name);
                    } else {
                        found = false;
                    }
                    n++;
                } while(found);
            } else {
                datasetsInfo.push(this.info);
            }
            let importedVars = {};
            for (let iDS=0; iDS < datasetsInfo.length; iDS++) {
                let info = datasetsInfo[iDS];
                this.rebuildWorld(info);
                this.info = info;
                for await (const band of info.bands) {
                    const vars = this.findVariablesForBand(band);
                    if (vars.length > 1) {
                        let msg = "Found " + vars.length + " possible variables for band " + band.band + ": ";
                        vars.forEach((v, i) => {
                            if (i > 0) msg += ", ";
                            msg += v.variable + (v.level !== undefined?" - level:" + v.level:"")
                        })
                        throw msg;
                    } 
                    if (vars.length) {
                        await this.importVariable(band, vars[0].variable, vars[0].level, fileTime, datasetsNames[iDS]);
                        importedVars[vars[0].variable] = true;
                    }
                }
            }
            // Generate calculated variables
            let varCodes = Object.keys(this.dataSet.config.variables);
            for (let i=0; i < varCodes.length; i++) {
                let varCode = varCodes[i];
                let variable = this.dataSet.config.variables[varCode];
                if (variable.calculated) {
                    let formula, changed = false, dependenciesExists = true, calcSources = [];
                    let dependsOn = Object.keys(variable.calculated);
                    for (let j=0; j<dependsOn.length; j++) {
                        let calcVarname = dependsOn[j];
                        let d = variable.calculated[calcVarname];
                        if (calcVarname == "formula") {
                            formula = d;
                        } else {
                            if (importedVars[d]) changed = true;
                            let depFilePath = this.dataSetCode + "/" + timeHelper.getPathForTime(this.dataSetCode, this.dataSet, fileTime);
                            depFilePath = config.dataPath + "/" + depFilePath + "/" + d + "_" + timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime) + "." + this.extension;
                            let exists = fs.existsSync(depFilePath);
                            if (!exists) dependenciesExists = false;
                            calcSources.push([calcVarname, depFilePath])
                        }
                    }
                    if (!formula) {
                        log.error("No formula declared for calculated variable " + varCode);
                    } else if (!changed) {
                        log.debug("No dependencies changed for calculated variable " + varCode)
                    } else if (!dependenciesExists) {
                        log.warn("Not all dependencies for calculated variable " + varCode + " exists. Skipping")
                    } else {
                        log.debug("  -> Calculating " + varCode + " as " + formula);
                        let calculatedTIFF = this.getRandomFilePath("tiff");
                        await gdal.calc(calcSources, calculatedTIFF, formula);
                        let calculatedFilePath = this.dataSetCode + "/" + timeHelper.getPathForTime(this.dataSetCode, this.dataSet, fileTime);
                        calculatedFilePath = config.dataPath + "/" + calculatedFilePath + "/" + varCode + "_" + timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime) + "." + this.extension;
                        await gdal.translate(calculatedTIFF, calculatedFilePath, null, null, true);
                        await fs.promises.unlink(calculatedTIFF);
                        let metadata = {};
                        await this.indexFile(calculatedFilePath, metadata);
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}

module.exports = RasterImporter;