const config = require("./Config");
const log = require("./Logs");
const fs = require("fs");
const moment = require("moment-timezone");
const timeHelper = require("./helpers/TimeHelper.js");

class Deleter {
    static get instance() {
        if (Deleter._singleton) return Deleter._singleton;
        Deleter._singleton = new Deleter();
        return Deleter._singleton;
    }

    init() {
        this.callDeleteDaemon(100);
    }
    callDeleteDaemon(ms = 60000 * 30) {
        if (this.timerDelete) clearTimeout(this.timerDelete);
        this.timerDelete = setTimeout(_ => {
            this.timerDelete = null;
            this.deleteDaemon();
        }, ms);
    }

    async deleteDaemon() {
        const serverConfig = config.serverConfig;
        if (!serverConfig) {
            this.callDeleteDaemon(100);
            return;
        }
        try {
            console.log("Iniciando demonio de borrado");            
            let dataSets = serverConfig.dataSets;
            //console.log("dataSets", dataSets);
            for (let dsCode of Object.keys(dataSets)) {
                let ds = dataSets[dsCode];
                if (!ds.config) {
                    log.warn("DataSet " + ds.name + " has no config");
                    continue;
                }
                let temporality = ds.config.temporality;
                if (!temporality || temporality == "none") continue;
                let days = parseInt(temporality.retainDays || temporality.retain);
                if (!isNaN(days)) {
                    try {
                        await this.deleteDataSet(dsCode, ds);
                    } catch(error) {
                        console.error(error);
                        log.error("Error en demonio de borrado para " + ds.name);
                        log.error(error.toString());
                    }
                }                
            }
        } catch(error) {
            console.error(error);
            log.error(error.toString());
        } finally {
            console.log("Finaliza demonio de borrado");
            this.callDeleteDaemon();
        }
    }

    async getSubdirs(path, nameLen, min, max) {
        try {
            let ret = await (
                new Promise((resolve, reject) => {
                    fs.readdir(path, {withFileTypes: true}, (err, files) => {
                        if (err) {reject(err); return;}
                        let subdirs = []
                        for (let d of files) {
                            if (d.isDirectory() && d.name.length == nameLen) {
                                let mm = parseInt(d.name);
                                if (mm >= min && mm <= max) subdirs.push(path + "/" + d.name);
                            }
                        }
                        resolve(subdirs);
                    })
                })
            )
            return ret;
        } catch (error) {
            throw error;
        }
    }

    async getFinalDirectories(dsCode, ds) {
        try {
            let path = config.dataPath + "/" + dsCode;
            let yeardirs = await this.getSubdirs(path, 4, 1500, 2500);
            let monthdirs = [];
            for (let yeardir of yeardirs) {
                let subdirs = await this.getSubdirs(yeardir, 2, 1, 12);
                monthdirs.push(...subdirs);
            }
            if (ds.config.temporality.unit == "days") return monthdirs;
            let daydirs = [];
            for (let monthdir of monthdirs) {
                let subdirs = await this.getSubdirs(monthdir, 2, 1, 31);
                daydirs.push(...subdirs);
            }
            return daydirs;
        } catch (error) {
            throw error;
        }
    }

    async getDirFiles(path) {
        try {
            let files = await (
                new Promise((resolve, reject) => {
                    fs.readdir(path, {withFileTypes: true}, (err, files) => {
                        if (err) {reject(err); return;}
                        let ret = [];
                        for (let d of files) {
                            if (!d.isDirectory()) ret.push(d.name);
                        }
                        resolve(ret);
                    })
                })
            )
            return files;
        } catch (error) {
            throw error;
        }
    }
    async isDirEmpty(path) {
        try {
            return await (
                new Promise((resolve, reject) => {
                    fs.readdir(path, {withFileTypes: true}, (err, files) => {
                        if (err) {reject(err); return;}                        
                        resolve(!files.length);
                    })
                })
            )
        } catch (error) {
            throw error;
        }
    }
    async checkDirectory(path, dsCode, ds, umbral) {
        try {
            let timeLength = ds.config.temporality.unit == "days"?10:16; // YYYY-MM-DD ó YYYY-MM-DD_HH-mm
            let files = await this.getDirFiles(path);
            for (let f of files) {
                let pos = f.lastIndexOf(".") - timeLength;
                let fileTime;
                try {
                    fileTime = timeHelper.getTimeInFileName(dsCode, ds, f, pos);
                } catch(error) {
                    fileTime = null;
                }
                if (fileTime && fileTime.isValid() && fileTime.isBefore(umbral)) {
                    try {
                        console.log("--> Deleting old file: " + path + "/" + f);
                        fs.unlinkSync(path + "/" + f);
                    } catch (error) {
                        console.error("Error borrando: " + path + "/" + f + ": " + error);
                    }
                }
            }
            // Borrar directorio "path" si está vacío
            let empty = await this.isDirEmpty(path);
            if (empty) fs.rmdir(path, _ => {
                console.log("--> Deleted directory " + path);
            }); // Sin callback
        } catch (error) {
            throw error;
        }
    }
    async deleteDataSet(dsCode, ds) {
        try {            
            let temporality = ds.config.temporality;
            let days = parseInt(temporality.retainDays || temporality.retain);
            let ahora = moment.tz("UTC");
            let umbral = ahora.subtract(days, "days");
            console.log("Buscando en " + ds.name + " archivos anteriores a " + umbral.format("YYYY-MM-DD HH:mm") + " para borrar");
            let dirs = await this.getFinalDirectories(dsCode, ds);
            for (let dir of dirs) {
                await this.checkDirectory(dir, dsCode, ds, umbral);
            }
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Deleter.instance;