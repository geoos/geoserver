const gdal = require("./GDAL");
const log = require("./Logs");

class RasterImporter {
    static isRasterFile(fileName) {
        let p = fileName.toLowerCase();
        return p.endsWith(".grb2");
    }
    static createImporter(filePath, importerConfig) {
        if (filePath.toLowerCase().endsWith(".grb2")) return new (require("./GRIB2Importer"))(filePath, importerConfig);
        return null;
    }
    static async importFile(fileName, filePath, importerConfig) {
        try {
            let importer = RasterImporter.createImporter(filePath, importerConfig);
            if (!importer) throw "No Raster importer for file " + filePath;
            log.info(`Importing ${fileName} using ${importer.name}`);
            await importer.import();
        } catch(error) {
            throw error;
        }

    }
    constructor(filePath, importerConfig) {
        this.filePath = filePath;
        this.importerConfig = importerConfig;
        this.name = "Abstract raster Importer";
    }

    async readFileInfo() {
        try {
            this.info = await gdal.info(this.filePath);
        } catch (error) {
            throw error;
        }
    }

    async import() {
        throw "import() not implemented";
    }
}

module.exports = RasterImporter;