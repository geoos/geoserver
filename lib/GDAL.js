const { exec } = require('child_process');
const fs = require("fs");
const config = require("./Config");

class GDAL {
    static get instance() {
        if (GDAL.singleton) return GDAL.singleton;
        GDAL.singleton = new GDAL();
        return GDAL.singleton;
    }

    exec(cmd, jsonOut=true, sizeFactor=1) {
        return new Promise((resolve, reject) => {
            exec(cmd, {maxBuffer:1024 * 1024 * sizeFactor}, (err, stdout, stderr) => {
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

    async locationinfo(path, x, y) {
        try {
            let cmd = "gdallocationinfo -valonly " + path + " " + x + " " + y;
            let v = parseFloat(await this.exec(cmd, false));
            return isNaN(v)?null:v;
        } catch (error) {
            throw error;
        }
    }

    parseLines(lines) {
        let ret = {rows:[], min:undefined, max:undefined};
        lines.forEach(l => {
            if (l.trim().length > 0) {
                let fields = l.trim().split(" ").filter(v => v.trim().length > 0);
                if (fields.length) {
                    let fieldName = fields[0];
                    if (!isNaN(parseFloat(fieldName))) {
                        let row = [];
                        ret.rows.push(row);
                        // row or single value
                        fields.forEach(field => {
                            let value = parseFloat(field);                            
                            if (isNaN(value)) throw "Formato de linea inválido\n" + l;
                            ret.value = value;
                            row.push(value);
                            if (ret.min === undefined || value < ret.min) ret.min = value;
                            if (ret.max === undefined || value > ret.max) ret.max = value;
                        });
                    } else {
                        // field = value
                        if (fields.length != 2) throw "Formato inválido para linea\n" + l + ".\n Se esperaba campo valor_numerico";
                        let value = parseFloat(fields[1]);
                        if (isNaN(value)) throw "Formato inválido para linea\n" + l + ".\n Se esperaba campo valor_numerico";
                        ret[fieldName] = value;
                    }
                }
            }
        });
        // invertir filas
        let swap = [];
        for (let i=ret.rows.length - 1; i>=0; i--) swap.push(ret.rows[i]);
        ret.rows = swap;
        return ret;
    }

    async grid(path, srcBox) {
        try {
            let tmpFileName = config.dataPath + "/tmp/grid_" + parseInt(Math.random() * 9999999999);
            let cmd = "gdal_translate -q";
            cmd += " -of AAIGrid -ot Float64";
            cmd += " -srcwin " + srcBox.x0 + " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            cmd += " " + path + " " + tmpFileName + ".tmp"
            await this.exec(cmd, false);
            let txt = await fs.promises.readFile(tmpFileName + ".tmp");
            let lines = txt.toString().split("\n");
            let data = this.parseLines(lines);                   
            fs.unlink(tmpFileName + ".prj", _ => {});
            fs.unlink(tmpFileName + ".tmp", _ => {});
            fs.unlink(tmpFileName + ".tmp.aux.xml", _ => {});
            return data;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async contour(path, srcBox, increment, polygons) {
        try {
            let tmpFileName = config.dataPath + "/tmp/grid_" + parseInt(Math.random() * 9999999999)
            let cmd = "gdal_translate -q";
            cmd += " -ot Float64";
            cmd += " -srcwin " + srcBox.x0 + " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            cmd += " " + path + " " + tmpFileName + ".tiff";
            await this.exec(cmd, false);
            let info = await this.info(tmpFileName + ".tiff", true);
            let min = info.bands[0].computedMin;
            let max = info.bands[0].computedMax;
            if (min == max) throw "No Data";
            if (!increment) {
                increment = Math.pow(10, parseInt(Math.log10(max - min) - 1));
                while (parseInt((max - min) / increment) < 10) increment /= 2;
                while (parseInt((max - min) / increment) > 30) increment *= 2;
            }
            if (!polygons) {
                cmd = "gdal_contour -a value -i " + increment + " " + tmpFileName + ".tiff " + tmpFileName + ".geojson";
            } else {
                cmd = "gdal_contour -amin minValue -amax maxValue -p -i " + increment + " " + tmpFileName + ".tiff " + tmpFileName + ".geojson";
            }
            await this.exec(cmd, false);
            let geojson = JSON.parse(await fs.promises.readFile(tmpFileName + ".geojson"));
            fs.unlink(tmpFileName + ".tiff", _ => {});
            fs.unlink(tmpFileName + ".geojson", _ => {});

            return {geojson, min, max, increment}
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
}


module.exports = GDAL.instance