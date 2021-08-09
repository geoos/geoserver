const AbstractServer = require("./AbstractServer");

class TilesServer extends AbstractServer {
    static get instance() {
        if (TilesServer.singleton) return TilesServer.singleton;
        TilesServer.singleton = new TilesServer();
        return TilesServer.singleton;
    }

    constructor() {
        super();
    }

    registerEndPoints(app, dataSetCode) {        
    }    
}

module.exports = TilesServer.instance;