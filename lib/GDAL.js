const { exec } = require('child_process');
const fs = require("fs");

class GDAL {
    static get instance() {
        if (GDAL.singleton) return GDAL.singleton;
        GDAL.singleton = new GDAL();
        return GDAL.singleton;
    }

    exec(cmd, jsonOut=true) {
        return new Promise((resolve, reject) => {
            exec(cmd, {maxBuffer:1024 * 1024}, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (stderr) {
                    reject(stderr);
                    return;
                }
                if (jsonOut) {
                    try {
                        resolve(JSON.parse(stdout));
                    } catch(error) {
                        reject(`Invalid jsonOutput from GDAL command ${cmd}: ${stdout}`)
                    }
                    return;
                }
                return stdout;
            });
        })
    }

    async info(path, includeMM=true) {
        try {
            return this.exec("gdalinfo" + " " + path + " -json" + (includeMM?" -mm":""))
        } catch (error) {
            throw error;
        }
    }
}

module.exports = GDAL.instance