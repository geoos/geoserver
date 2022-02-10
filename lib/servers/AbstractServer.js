const log = require("../Logs");

class AbstractServer {
    static getServerForDataSource(dataSource) {
        switch (dataSource.config.dataSet.type) {
            case "raster": return require("./RasterServer");
            case "vector": return require("./GeoJsonServer")
            case "tiles": return require("./TilesServer");

            default: {
                log.error("DataSet type '" + dataSource.config.dataSet.type + "' not handled in getServerForDataSource");
                return null;
            }
        }
    }

    returnInternalError(res, error) {
        res.status(500).send(error?error:"Internal Server Error. Please retry later");
    }
    returnDataError(res, error) {
        res.status(400).send(error);
    }
    returnNotFoundError(res, error) {
        res.status(404).send(error);
    }
    returnJson(res, ret) {
        res.setHeader('Content-Type', 'application/json');
        res.status(200);
        if (typeof ret == "number") res.send("" + ret);
        else res.send(ret?ret:null);    
    }

    registerEndPoints(app, dataSetCode) {}
}

module.exports = AbstractServer;