const RasterImporter = require("./RasterImporter");
const log = require("./Logs");
const rasterHelper = require("./RasterHelper");
const gdal = require("./GDAL");
const fs = require("fs");
const timeHelper = require("./TimeHelper");
const filesHelper = require("./FilesHelper");
const config = require("./Config");

class GRIB2Importer extends RasterImporter {
    constructor(filePath, importerConfig, dataSetCode, dataSet) {
        super(filePath, importerConfig, dataSetCode, dataSet);
        this.name = "GRIB2 Raster Importer"
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
        let keys = Object.keys(selector);
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
            let dsLimits = this.dataSet.config.limits;
            if (dsLimits) {
                let limits = {
                    lng0:rasterHelper.toGDALLng(dsLimits.w),
                    lat0:dsLimits.s,
                    lng1:rasterHelper.toGDALLng(dsLimits.e),
                    lat1:dsLimits.n
                }
                if (limits) {
                    srcBox = rasterHelper.normalizeBox(this.world, limits);
                }
            }
            let tmpGRB2 = this.getRandomFilePath("grb2");
            await gdal.translate(this.filePath, tmpGRB2, [band.band], srcBox, true);
            if (variable.transform) {
                log.debug("  -> Applying transformation: " + variable.transform);
                // gdal_calc.py canot produce grb2 file. Create tiff and translate to grb2
                let transformedTIFF = this.getRandomFilePath("tiff");
                await gdal.calc([["Z", tmpGRB2]], transformedTIFF, variable.transform);
                await fs.promises.unlink(tmpGRB2);
                let transformedGRB2 = this.getRandomFilePath("grb2");
                await gdal.translate(transformedTIFF, transformedGRB2, null, null, false);
                await fs.promises.unlink(transformedTIFF);
                tmpGRB2 = transformedGRB2;
            }
            let targetFilePath = this.dataSetCode + "/" + timeHelper.getPathForTime(this.dataSetCode, this.dataSet, fileTime);
            await filesHelper.ensureDir(config.dataPath, targetFilePath);
            targetFilePath = config.dataPath + "/" + targetFilePath + "/" + varCode + "_" + timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime) + ".grb2";
            await fs.promises.rename(tmpGRB2, targetFilePath);
            await this.indexFile(targetFilePath);
        } catch (error) {
            throw error;
        }
    }
    async import() {
        try {
            if (this.dataSet.config.dataSet.format != "grib2") throw "Expected dataSetType = 'grib2' and found '" + this.dataSet.config.dataSetType + "'";
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

module.exports = GRIB2Importer;