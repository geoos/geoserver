const gdal = require("../GDAL");
const log = require("../Logs");
const config = require("../Config");
const fs = require("fs");
const rasterHelper = require("../helpers/RasterHelper");

class RasterImporter {
    static isRasterFile(fileName) {
        let p = fileName.toLowerCase();
        return p.endsWith(".grb2");
    }
    static createImporter(filePath, serverConfig, dataSetCode, dataSet) {
        if (dataSet.config.dataSet.format == "grib2") {
            if (!filePath.toLowerCase().endsWith(".grb2")) throw "Expected file extension for dataSet '" + dataSetCode + "' is '.grb2'";
            return new (require("./GRIB2Importer"))(filePath, serverConfig, dataSetCode, dataSet);
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
    constructor(filePath, serverConfig, dataSetCode, dataSet) {
        this.filePath = filePath;
        this.serverConfig = serverConfig;
        this.dataSetCode = dataSetCode
        this.dataSet = dataSet;
        this.name = "Abstract raster Importer";
    }

    async readFileInfo() {
        try {
            this.info = await gdal.info(this.filePath, false);
            this.world = {
                lng0:rasterHelper.to360Lng(this.info.cornerCoordinates.upperLeft[0]),
                lat1:this.info.cornerCoordinates.upperLeft[1],
                lng1:rasterHelper.to360Lng(this.info.cornerCoordinates.lowerRight[0]),
                lat0:this.info.cornerCoordinates.lowerRight[1]
            }
            if (this.world.lng0 == this.world.lng1) this.world.lng0 -= 360;
            this.world.dLng = (this.world.lng1 - this.world.lng0) / this.info.size[0];
            this.world.dLat = (this.world.lat1 - this.world.lat0) / this.info.size[1];
            this.world.width = this.info.size[0];
            this.world.height = this.info.size[1];
        } catch (error) {
            throw error;
        }
    }

    async import() {
        throw "import() not implemented";
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
}

module.exports = RasterImporter;