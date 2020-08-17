const fs = require("fs");
const http = require("http");
const https = require("https");
const log = require("./Logs");
const express = require("express");
const bodyParser = require('body-parser');
const AbstractServer = require("./servers/AbstractServer");

class WebServer {
    static get instance() {
        if (WebServer.singleton) return WebServer.singleton;
        WebServer.singleton = new WebServer();
        return WebServer.singleton;
    }

    async start() {
        try {
            let wsConfig = require("./Config").serverConfig.webServer;
            if (!wsConfig) {
                log.error("No webServer config found");
                return;
            }
            let port = parseInt(wsConfig.port);
            if (isNaN(port)) {
                log.errror("Invalid webserver port");
                return;
            }
            let serverFactory, options;
            if (wsConfig.protocol == "http") {
                serverFactory = http;
                options = {};
            } else if (wsConfig.protocol == "https") {
                let key, cert;
                try {
                    key = fs.readFileSync(config.configPath + "/" + wsConfig.keyFile);
                } catch(error) {
                    log.error("Cannot read key keyFile: " + error.toString());
                    return;
                }
                try {
                    cert = fs.readFileSync(config.configPath + "/" + wsConfig.certFile);
                } catch(error) {
                    log.error("Cannot read cert certFile: " + error.toString());
                    return;
                }
                otions = {key, cert}
                serverFactory = https;
            } else {
                log.error("Invalid protocol. Expected http or https");
                return;
            }
            try {
                log.debug("Starting " + wsConfig.protocol +  " web server at port " + port);
                this.app = express();
                this.server = serverFactory.createServer(options, this.app);
                this.enableGracefulShutdown(this.server, 2000);
                this.server.listen(port, e => {
                     if (e) {
                         log.error("Cannot start web server: " + e.toString());
                         this.close();
                         return;
                    }
                    this.registerEndPoints();
                    log.info(wsConfig.protocol +  " web server started at port " + port);
                });
            } catch(error) {
                log.error("Cannot start http(s) server:" + error.toString());
                return;
            }
        } catch (error) {
            throw error;
        }
    }
    async stop() {
        try {
            if (!this.server) return;
            log.info("Stopping web server ...");
            await (new Promise(resolve => {
                this.server.shutdown(e => {
                    if (e) log.error("Error stopping web server:" + e.toString());
                    resolve();
                });    
            }))
            this.server = null;
            this.app = null;
            log.info("Web Server stopped");
        } catch(error) {
            log.error("Error stopping web server: " + error.toString())
            throw error;
        }
    }

    async restart() {
        try {
            await this.stop();
            await this.start();
        } catch (error) {
            console.error(error);
        }
    }

    enableGracefulShutdown(server, socketIdleTimeout) {
        server.socketIdleTimeout = socketIdleTimeout || 10000;
        server.activeConnections = {};
      
        server.on('connection', function(conn) {
            var key = conn.remoteAddress + ':' + conn.remotePort;
            server.activeConnections[key] = conn;
            conn.on('close', function() {
                delete server.activeConnections[key];
            });
        });
      
        server.shutdown = function(cb) {
            server.close(cb);
            for (var key in server.activeConnections) {
                server.activeConnections[key].setTimeout(server.socketIdleTimeout, function() {
                    if(server.activeConnections[key]) {
                        server.activeConnections[key].destroy();  
                    }
                });
            }
        };
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

    registerMetadataEndPoints() {
        const config = require("./Config");
        this.app.get("/metadata", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            this.returnJson(res, config.publicMetadata);
        })
        this.app.get("/metadata/providers", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            this.returnJson(res, config.publicMetadata.providers);
        })
        this.app.get("/metadata/providers/:code", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            let p = config.publicMetadata.providers.find(p => p.code == req.params.code);
            if (!p) {
                this.returnDataError(res, "No provider found with code '" + req.params.code + "'");
                return;
            }
            this.returnJson(res, p);
        })
        this.app.get("/metadata/datasets", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            this.returnJson(res, config.publicMetadata.dataSets);
        })
        this.app.get("/metadata/datasets/:code", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            let d = config.publicMetadata.dataSets.find(d => d.code == req.params.code);
            if (!d) {
                this.returnDataError(res, "No dataSet found with code '" + req.params.code + "'");
                return;
            }
            this.returnJson(res, d);
        })
        this.app.get("/metadata/datasets/:code/variables", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            let d = config.publicMetadata.dataSets.find(d => d.code == req.params.code);
            if (!d) {
                this.returnDataError(res, "No dataSet found with code '" + req.params.code + "'");
                return;
            }
            this.returnJson(res, d.variables);
        })
        this.app.get("/metadata/datasets/:code/variables/:varCode", (req, res) => {
            if (!config.publicMetadata) {
                this.returnInternalError(res, "No Metadata Available. Please retry later");
                return;
            }
            let d = config.publicMetadata.dataSets.find(d => d.code == req.params.code);
            if (!d) {
                this.returnDataError(res, "No dataSet found with code '" + req.params.code + "'");
                return;
            }
            let v = d.variables.find(v => v.code == req.params.varCode);
            if (!v) {
                this.returnDataError(res, "No variable with code '" + req.params.varCode + "' found in dataSet '" + req.params.code + "'");
                return;
            }
            this.returnJson(res, v);
        })
    }

    registerEndPoints() {
        const config = require("./Config");
        this.app.use("/", express.static(config.wwwPath));
        this.app.use(bodyParser.urlencoded({limit: '50mb', extended:true}));
        this.app.use(bodyParser.json({limit: '50mb', extended: true}));
        this.app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
            next();
        });
        if (config.serverConfig.thisGeoServer.enableTestWebServer) {
            this.app.use("/test", express.static(__dirname + "/../testApp"));
        }
        this.registerMetadataEndPoints();
        for (let dsCode in config.serverConfig.dataSets) {
            const dataSet = config.serverConfig.dataSets[dsCode]
            AbstractServer.getServerForDataSource(dataSet).registerEndPoints(this.app, dsCode);
        }        
    }

}

module.exports = WebServer.instance;