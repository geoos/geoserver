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
        let bufferSize = 1024 * 1024 * sizeFactor;
        return new Promise((resolve, reject) => {
            exec(cmd, {maxBuffer:bufferSize}, (err, stdout, stderr) => {
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
                        let idx = stdout.indexOf("{");
                        if (idx > 0) {
                            // Ignore beggining of file
                            let wng = stdout.substr(0,idx);
                            console.log("Ignoring possible warnings:" + wng);
                            stdout = stdout.substr(idx);
                        }
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

    async info(path, includeMM=true, sizeFactor=1) {
        try {
            return this.exec("gdalinfo" + " " + path + " -json" + (includeMM?" -mm":""), true, sizeFactor)
        } catch (error) {
            throw error;
        }
    }

    async translate(path, outPath, bands, srcBox, unscale, ot) {
        try {
            let cmd = "gdal_translate -q ";
            if (path.endsWith(".nc")) cmd += " -if NETCDF";
            if (outPath.endsWith(".nc")) cmd += " -of NETCDF";
            (bands || []).forEach(b => cmd += " -b " + b);
            if (srcBox) cmd += " -srcwin " + srcBox.x0+ " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            if (unscale) cmd += " -unscale";
            if (ot) cmd += " -ot " + ot;
            cmd += " " + path + " " + outPath;
            //console.log(cmd);
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
            cmd += " --NoDataValue=-14581.111234321";
            cmd += " --quiet";
            cmd += " --outfile=" + targetFile;
            cmd += ' --calc="' + formula + '"';
            await this.exec(cmd, false);
        } catch (error) {
            throw error;
        }
    }

    async locationinfo(path, x, y) {
        try {
            let cmd = "gdallocationinfo -valonly " + path + " " + x + " " + y;
            let v = await this.exec(cmd, false);
            v = parseFloat(await this.exec(cmd, false));
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

    async grid(path, srcBox, maxWidth, maxHeight, resampling) {
        try {
            let warnings = []
            let outSize="", newDLng = srcBox.dLng, newDLat = srcBox.dLat;
            if (srcBox.width > maxWidth || srcBox.height > maxHeight) {
                let w = Math.min(srcBox.width, maxWidth);
                let h = Math.min(srcBox.height, maxHeight)
                let xres = (srcBox.lng1 - srcBox.lng0) / w;
                let yres = (srcBox.lat1 - srcBox.lat0) / h;
                newDLng = xres,
                newDLat = yres;
                outSize = " -tr " + xres + " " + yres + " -co force_cellsize=true -r " + resampling
                warnings.push(`Data resampled using '${resampling}' algorithm to (width, height) = (${w}, ${h})`)
            }
            let tmpFileName = config.dataPath + "/tmp/grid_" + parseInt(Math.random() * 9999999999);
            let cmd = "gdal_translate -q";
            cmd += " -of AAIGrid -ot Float64";
            cmd += " -srcwin " + srcBox.x0 + " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            cmd += outSize;
            cmd += " " + path + " " + tmpFileName + ".tmp"
            console.log("cmd", cmd);
            await this.exec(cmd, false);
            let txt = await fs.promises.readFile(tmpFileName + ".tmp");
            let lines = txt.toString().split("\n");
            let data = this.parseLines(lines);
            if (data.NODATA_value !== undefined) {
                let min, max;
                for (let i=0; i<data.nrows; i++) {
                    for (let j=0; j<data.ncols; j++) {
                        let v = data.rows[i][j];
                        if (v == data.NODATA_value) {
                            data.rows[i][j] = null;
                        } else {
                            if (min === undefined || v < min) min = v;
                            if (max === undefined || v > max) max = v;
                        }
                    }
                }
                data.min = min;
                data.max = max;
            }
            data.newDLng = newDLng;
            data.newDLat = newDLat;
            data.warnings = warnings;
            fs.unlink(tmpFileName + ".prj", _ => {});
            fs.unlink(tmpFileName + ".tmp", _ => {});
            fs.unlink(tmpFileName + ".tmp.aux.xml", _ => {});
            return data;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async forcedGrid(path, srcBox, resampling, noDataValue = undefined) {
        try {
            let w = (srcBox.lng1 - srcBox.lng0) / srcBox.dLng;
            let h = (srcBox.lat1 - srcBox.lat0) / srcBox.dLat;
            let tmpFileName = config.dataPath + "/tmp/grid_" + parseInt(Math.random() * 9999999999);
            let cmd = "gdal_translate -q";
            cmd += " -of AAIGrid -ot Float64";
            if (noDataValue !== undefined) cmd += " -a_nodata " + noDataValue;
            cmd += " -projwin " + srcBox.lng0 + " " + srcBox.lat1 + " " + srcBox.lng1 + " " + srcBox.lat0;
            cmd += " -outsize " + w + " " + h;
            cmd += " -co force_cellsize=true -r " + resampling
            cmd += " " + path + " " + tmpFileName + ".tmp"
            //console.log("cmd", cmd);
            await this.exec(cmd, false);
            let txt = await fs.promises.readFile(tmpFileName + ".tmp");
            //console.log("txt", txt.toString());
            let lines = txt.toString().split("\n");
            let data = this.parseLines(lines);
            if (data.NODATA_value !== undefined) {
                let min, max;
                for (let i=0; i<data.nrows; i++) {
                    for (let j=0; j<data.ncols; j++) {
                        let v = data.rows[i][j];
                        if (v == data.NODATA_value) {
                            data.rows[i][j] = null;
                        } else {
                            if (min === undefined || v < min) min = v;
                            if (max === undefined || v > max) max = v;
                        }
                    }
                }
                data.min = min;
                data.max = max;
            }
            fs.unlink(tmpFileName + ".prj", _ => {});
            fs.unlink(tmpFileName + ".tmp", _ => {});
            fs.unlink(tmpFileName + ".tmp.aux.xml", _ => {});
            return data;
            /*

            let warnings = []
            let outSize="", newDLng = srcBox.dLng, newDLat = srcBox.dLat;
            if (srcBox.width > maxWidth || srcBox.height > maxHeight) {
                let w = Math.min(srcBox.width, maxWidth);
                let h = Math.min(srcBox.height, maxHeight)
                let xres = (srcBox.lng1 - srcBox.lng0) / w;
                let yres = (srcBox.lat1 - srcBox.lat0) / h;
                newDLng = xres,
                newDLat = yres;
                outSize = " -tr " + xres + " " + yres + " -co force_cellsize=true -r " + resampling
                warnings.push(`Data resampled using '${resampling}' algorithm to (width, height) = (${w}, ${h})`)
            }
            let tmpFileName = config.dataPath + "/tmp/grid_" + parseInt(Math.random() * 9999999999);
            let cmd = "gdal_translate -q";
            cmd += " -of AAIGrid -ot Float64";
            cmd += " -srcwin " + srcBox.x0 + " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            cmd += outSize;
            cmd += " " + path + " " + tmpFileName + ".tmp"
            console.log("cmd", cmd);
            await this.exec(cmd, false);
            let txt = await fs.promises.readFile(tmpFileName + ".tmp");
            let lines = txt.toString().split("\n");
            let data = this.parseLines(lines);
            if (data.NODATA_value !== undefined) {
                let min, max;
                for (let i=0; i<data.nrows; i++) {
                    for (let j=0; j<data.ncols; j++) {
                        let v = data.rows[i][j];
                        if (v == data.NODATA_value) {
                            data.rows[i][j] = null;
                        } else {
                            if (min === undefined || v < min) min = v;
                            if (max === undefined || v > max) max = v;
                        }
                    }
                }
                data.min = min;
                data.max = max;
            }
            data.newDLng = newDLng;
            data.newDLat = newDLat;
            data.warnings = warnings;
            fs.unlink(tmpFileName + ".prj", _ => {});
            fs.unlink(tmpFileName + ".tmp", _ => {});
            fs.unlink(tmpFileName + ".tmp.aux.xml", _ => {});
            return data;
            */
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async contour(path, srcBox, increment, polygons, maxWidth, maxHeight, resampling, fixedLevels) {
        try {
            let warnings = []
            let outSize="", newDLng = srcBox.dLng, newDLat = srcBox.dLat;
            if (srcBox.width > maxWidth || srcBox.height > maxHeight) {
                let w = Math.min(srcBox.width, maxWidth);
                let h = Math.min(srcBox.height, maxHeight)
                let xres = (srcBox.lng1 - srcBox.lng0) / w;
                let yres = (srcBox.lat1 - srcBox.lat0) / h;
                newDLng = xres,
                newDLat = yres;
                outSize = " -tr " + xres + " " + yres + " -r " + resampling
                warnings.push(`Data resampled using '${resampling}' algorithm to (width, height) = (${w}, ${h})`)
            }
            let tmpFileName = config.dataPath + "/tmp/grid_" + parseInt(Math.random() * 9999999999)
            let cmd = "gdal_translate -q";
            cmd += " -ot Float64";
            cmd += " -srcwin " + srcBox.x0 + " " + srcBox.y0 + " " + srcBox.width + " " + srcBox.height;
            cmd += outSize;
            cmd += " " + path + " " + tmpFileName + ".tiff";
            await this.exec(cmd, false);
            let info = await this.info(tmpFileName + ".tiff", true);
            let min = info.bands[0].computedMin;
            let max = info.bands[0].computedMax;
            if (min == max) throw "No Data";            
            if (!increment) {
                increment = Math.pow(10, parseInt(Math.log10(max - min) - 1));
                let minLimit = polygons?20:5;
                let maxLimit = polygons?35:20;
                while (parseInt((max - min) / increment) < minLimit) increment /= 2;
                while (parseInt((max - min) / increment) > maxLimit) increment *= 2;
            }
            if (!fixedLevels) {
                if (!polygons) {
                    cmd = "gdal_contour -a value -i " + increment + " " + tmpFileName + ".tiff " + tmpFileName + ".geojson";
                } else {
                    cmd = "gdal_contour -amin minValue -amax maxValue -p -i " + increment + " " + tmpFileName + ".tiff " + tmpFileName + ".geojson";
                }
            } else {
                if (!polygons) {
                    cmd = "gdal_contour -a value -fl " + fixedLevels + " " + tmpFileName + ".tiff " + tmpFileName + ".geojson";
                } else {
                    cmd = "gdal_contour -amin minValue -amax maxValue -p -fl " + fixedLevels + " " + tmpFileName + ".tiff " + tmpFileName + ".geojson";
                }
            }
            await this.exec(cmd, false);
            let geojson = JSON.parse(await fs.promises.readFile(tmpFileName + ".geojson"));
            fs.unlink(tmpFileName + ".tiff", _ => {});
            fs.unlink(tmpFileName + ".geojson", _ => {});

            return {geojson, min, max, increment, warnings, newDLng, newDLat}
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    /*
    async centerLon(fileName, path) {
        try {
            let cmd = "gdalwarp -t_srs WGS84 " + path + "/" + fileName + " " + path + "/out-" + fileName + " -wo SOURCE_EXTRA=1000 --config CENTER_LONG 0 -overwrite";
            await this.exec(cmd, false);
            fs.unlinkSync(path + "/" + fileName);
            fs.renameSync(path + "/out-" + fileName, path + "/" + fileName);
        } catch(error) {
            console.error(error);
            throw error;
        }
    }
    */

    async centerLon(inPath, outPath) {
        try {
            let cmd = "gdalwarp -t_srs WGS84 " + inPath + " " + outPath +  " -wo SOURCE_EXTRA=1000 --config CENTER_LONG 0 -overwrite";
            await this.exec(cmd, false);
        } catch(error) {
            console.error(error);
            throw error;
        }
    }
}


module.exports = GDAL.instance