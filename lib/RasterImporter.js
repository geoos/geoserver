const gdal = require("./GDAL");
const log = require("./Logs");

class RasterImporter {
    static isRasterFile(fileName) {
        let p = fileName.toLowerCase();
        return p.endsWith(".grb2");
    }
    static createImporter(filePath, importerConfig, providerCode, provider) {
        if (filePath.toLowerCase().endsWith(".grb2")) return new (require("./GRIB2Importer"))(filePath, importerConfig, providerCode, provider);
        return null;
    }
    static async importFile(fileName, filePath, importerConfig) {
        try {
            let p = fileName.lastIndexOf(".");
            let providerCode = fileName.substr(0, p);
            providerCode = providerCode.substr(0, providerCode.length - 17);
            let provider = importerConfig.providers[providerCode];
            if (!provider) throw "No provider declared with code '" + providerCode + "'";
            let importer = RasterImporter.createImporter(filePath, importerConfig, providerCode, provider);
            if (!importer) throw "No Raster importer for file " + filePath;
            log.debug(`Importing ${fileName} using ${importer.name}`);
            await importer.import();
            log.debug(`File Imported: ${fileName}`);
            return provider;
        } catch(error) {
            throw error;
        }

    }
    constructor(filePath, importerConfig, providerCode, provider) {
        this.filePath = filePath;
        this.importerConfig = importerConfig;
        this.providerCode = providerCode;
        this.provider = provider;
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