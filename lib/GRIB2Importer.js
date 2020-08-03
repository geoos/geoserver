const RasterImporter = require("./RasterImporter");

class GRIB2Importer extends RasterImporter {
    constructor(filePath, importerConfig) {
        super(filePath, importerConfig);
        this.name = "GRIB2 Raster Importer"
    }
}

module.exports = GRIB2Importer;