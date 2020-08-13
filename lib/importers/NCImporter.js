const RasterImporter = require("./RasterImporter");
const log = require("../Logs");
const rasterHelper = require("../helpers/RasterHelper");
const gdal = require("../GDAL");
const fs = require("fs");
const timeHelper = require("../helpers/TimeHelper");
const filesHelper = require("../helpers/FilesHelper");
const config = require("../Config");

class NCImporter extends RasterImporter {
    constructor(filePath, serverConfig, dataSetCode, dataSet) {
        super(filePath, serverConfig, dataSetCode, dataSet);
        this.name = "NetCDF Raster Importer"
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
            if (this.passSelector(variable.selector, bandVars)) {
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

    async importVariable(band, varCode, varLevel, fileTime) {
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
            let tmpNC = this.getRandomFilePath("nc");
            await gdal.translate(this.filePath, tmpNC, [band.band], srcBox, true);
            if (variable.transform) {
                log.debug("  -> Applying transformation: " + variable.transform);
                // gdal_calc.py canot produce grb2 file. Create tiff and translate to grb2
                let transformedNC = this.getRandomFilePath("nc");
                await gdal.calc([["Z", tmpNC]], transformedNC, variable.transform);
                await fs.promises.unlink(tmpNC);
                tmpNC = transformedNC;
            }
            let targetFilePath = this.dataSetCode + "/" + timeHelper.getPathForTime(this.dataSetCode, this.dataSet, fileTime);
            await filesHelper.ensureDir(config.dataPath, targetFilePath);
            targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode;
            let timePart = timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime);
            if (timePart) targetFilePath += "_" + timePart;
            targetFilePath += ".nc";
            await fs.promises.rename(tmpNC, targetFilePath);
            let metadata = {};
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
            if (this.dataSet.config.dataSet.format != "netCDF") throw "Expected dataSet.format = 'netCDF' and found '" + this.dataSet.config.dataSet.format + "'";
            let fileTime = timeHelper.getTimeInFileName(this.dataSetCode, this.dataSet, this.getFileName());
            timeHelper.validateTimeForDataSet(this.dataSetCode, this.dataSet, fileTime);
            await this.readFileInfo();
            for await (const band of this.info.bands) {
                const vars = this.findVariablesForBand(band);
                if (vars.length > 1) {
                    let msg = "Found " + vars.length + " possible variables for band " + band.band + ": ";
                    vars.forEach((v, i) => {
                        if (i > 0) mgs += ", ";
                        msg += v.variable + (v.level !== undefined?" - level:" + v.level:"")
                    })
                    throw msg;
                } 
                if (vars.length) {
                    await this.importVariable(band, vars[0].variable, vars[0].level, fileTime);
                }
            }
        } catch (error) {
            throw error;
        }
    }
}
module.exports = NCImporter;