const RasterImporter = require("./RasterImporter");
const log = require("./Logs");

class GRIB2Importer extends RasterImporter {
    constructor(filePath, importerConfig, providerCode, provider) {
        super(filePath, importerConfig, providerCode, provider);
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
        Object.keys(this.provider.config.variables).forEach(varCode => {
            const variable = this.provider.config.variables[varCode];
            if (this.passSelector(variable.selector, bandVars)) {
                if (variable.levels) {
                    let v = bandVars[variable.levels.attribute];
                    if (v) {
                        const level = variable.levels.values.indexOf(v);
                        if (level >= 0) vars.push({variable:varCode, level})
                    }
                } else {
                    vars.push({variable:varCode, level:0})
                }
            }
        })
        return vars;
    }

    async importVariable(band, varCode, varLevel) {
        try {
            log.debug("Importing " + varCode + "-" + varLevel);
        } catch (error) {
            throw error;
        }
    }
    async import() {
        try {
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
                    await this.importVariable(band, vars[0].variable, vars[0].level);
                }
            }
        } catch (error) {
            throw error;
        }
    }
}

module.exports = GRIB2Importer;