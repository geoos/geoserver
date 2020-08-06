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
                        let out = JSON.parse(stdout);
                        resolve(out);
                    } catch(error) {
                        reject(`Invalid jsonOutput from GDAL command ${cmd}: ${stdout}`)
                    }
                    return;
                }
                resolve(stdout);
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

    async translate(path, outPath, bands, srcBox, unscale) {
        try {
            let cmd = "gdal_translate -q ";
            (bands || []).forEach(b => cmd += " -b " + b);
            if (srcBox) cmd += " -srcwin " + srcBox.x0+ " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            if (unscale) cmd += " -unscale";
            cmd += " " + path + " " + outPath;
            await this.exec(cmd, false);
        } catch (error) {
            throw error;
        }
    }

    async calc(sources, targetFile, formula) {
        try {
            let cmd = "python3 /usr/bin/gdal_calc.py";
            sources.forEach(s => {
                cmd += " -" + s[0] + " " + s[1]
            })
            cmd += " --outfile=" + targetFile;
            cmd += ' --calc="' + formula + '"';
            cmd += " --q";
            await this.exec(cmd, false);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = GDAL.instance