const timeHelper = require("../helpers/TimeHelper");
const filesHelper = require("../helpers/FilesHelper");
const config = require("../Config");
const log = require("../Logs");
const fs = require("fs");
const turf = require("@turf/turf");

class GeoJsonImporter {
    static async importFile(dataSetCode, dataSet, workingFile, serverConfig) {
        try {
            let importer = new GeoJsonImporter(workingFile, serverConfig, dataSetCode, dataSet);
            await importer.import();
        } catch(error) {
            throw error;
        }
    }

    constructor(filePath, serverConfig, dataSetCode, dataSet) {
        this.filePath = filePath;
        this.serverConfig = serverConfig;
        this.dataSetCode = dataSetCode
        this.dataSet = dataSet;
    }

    getFileName() {
        let p = this.filePath.lastIndexOf("/");
        return this.filePath.substr(p+1);
    }

    readJson(path) {
        return new Promise((resolve, reject) => {
            fs.readFile(path, {encoding:"UTF-8"}, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    resolve(JSON.parse(data.toString("UTF-8")));
                } catch(error) {
                    reject(error);
                }
            })    
        });
    }

    writeJson(path, json) {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, JSON.stringify(json), err => {
                if (err) reject(err);
                else resolve();
            })
        });
    }

    async indexFile(geoJsonFile, sourceFilePath, targetFilePath) {
        try {
            if (!this.dataSet.config.files) return;
            // extract extension
            let p = geoJsonFile.lastIndexOf(".");
            let fileName = geoJsonFile.substr(0, p);
            let fileMetadata = this.dataSet.config.files[fileName];
            if (!fileMetadata || !fileMetadata.metadata) return;
            fileMetadata = fileMetadata.metadata;
            log.debug("Openning file: " + sourceFilePath);
            let geoJson = await this.readJson(sourceFilePath);
            log.debug("Processing file: " + sourceFilePath + " => " + targetFilePath);
            let objects = [];
            for (let i=0; i < geoJson.features.length; i++) {
                let feature = geoJson.features[i];
                let obj = {};
                let newProps = {};
                if (fileMetadata.idProperty) {
                    let v = feature.properties[fileMetadata.idProperty];
                    if (v) {
                        obj.id = v;
                        newProps.id = v;
                    } else {
                        newProps.id="id_" + i;
                    }
                }
                if (fileMetadata.nameProperty) {
                    let v = feature.properties[fileMetadata.nameProperty];
                    if (v) {
                        obj.name = v;
                        newProps.name = v;
                    } else {
                        newProps.name = "Name of " + i
                    }
                }
                if (fileMetadata.copyProperties) {
                    for (let propName in fileMetadata.copyProperties) {
                        if (propName != fileMetadata.idProperty && propName != fileMetadata.nameProperty) {
                            let v = feature.properties[propName];
                            if (v) {
                                obj[fileMetadata.copyProperties[propName]] = v;
                                newProps[fileMetadata.copyProperties[propName]] = v;
                            }
                        }
                    }
                }
                if (fileMetadata.centroid) {
                    let c = turf.centroid(feature);
                    obj.centroid = {lat:c.geometry.coordinates[1], lng:c.geometry.coordinates[0]}
                    newProps.centroidLat = c.geometry.coordinates[1];
                    newProps.centroidLng = c.geometry.coordinates[0];
                }
                if (fileMetadata.center) {
                    let c = turf.center(feature);
                    obj.center = {lat:c.geometry.coordinates[1], lng:c.geometry.coordinates[0]}
                    newProps.centerLat = c.geometry.coordinates[1];
                    newProps.centerLng = c.geometry.coordinates[0];
                }
                if (Object.keys(obj).length > 0) objects.push(obj)  
                feature.properties = newProps;              
            }
            let metadata = {objects:objects}
            p = targetFilePath.lastIndexOf(".");
            let metadataFile = targetFilePath.substr(0, p) + ".json";
            await this.writeJson(metadataFile, metadata);
            log.debug("Writting file: " + targetFilePath);
            await this.writeJson(targetFilePath, geoJson);
        } catch (error) {
            throw error;
        }
    }

    async import() {
        try {
            let srcFileName = this.getFileName();
            let p = srcFileName.indexOf("_");
            if (p < 0) throw "Cannot find '_' in filename after dataSet anme to extract referenced geojson file";
            let geoJsonFileName;
            let p2 = srcFileName.indexOf("_", p+1);
            if (p2 < 0) geoJsonFileName = srcFileName.substr(p+1);
            else geoJsonFileName = srcFileName.substring(p+1, p2);
            let fileTime = timeHelper.getTimeInFileName(this.dataSetCode, this.dataSet, srcFileName, p);
            timeHelper.validateTimeForDataSet(this.dataSetCode, this.dataSet, fileTime);
            let path = this.dataSetCode;
            let pathTimePart = timeHelper.getPathForTime(this.dataSetCode, this.dataSet, fileTime);
            if (pathTimePart) path += "/" + pathTimePart;
            await filesHelper.ensureDir(config.dataPath, path);
            let targetFileName = geoJsonFileName;
            let timePart = timeHelper.getTimeForFileName(this.dataSetCode, this.dataSet, fileTime);
            if (timePart) targetFileName += "_" + timePart;

            let targetPath = config.dataPath + "/" + path + "/" + targetFileName;
            await this.indexFile(geoJsonFileName, config.dataPath+ "/working/" + this.filePath, targetPath);

            fs.renameSync(config.dataPath+ "/working/" + this.filePath, config.dataPath+ "/finished/" + this.filePath);
            log.info("File " + this.filePath + " imported");
            //await this.indexFile(geoJsonFileName, config.dataPath + "/" + path + "/" + targetFileName);

            // delete or move to finished
        } catch (error) {
            throw error;
        }
    }
}

module.exports = GeoJsonImporter;