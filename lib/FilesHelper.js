const fs = require("fs");
const log = require("./Logs");

class FielsHelper {
    static get instance() {
        if (FielsHelper.singleton) return FielsHelper.singleton;
        FielsHelper.singleton = new FielsHelper();
        return FielsHelper.singleton;
    }

    async ensureDir(basePath, path) {
        try {
            if (fs.existsSync(basePath + "/" + path)) return;
            let parts = path.split("/");
            let current = basePath;
            for await (let part of parts) {
                if (part) {
                    current += "/" + part;
                    if (! (fs.existsSync(current))) {
                        log.info("Creating directory: " + current);
                        await fs.promises.mkdir(current);
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
    async ensureDirSync(basePath, path) {
        try {
            if (fs.existsSync(basePath + "/" + path)) return;
            let parts = path.split("/");
            let current = basePath;
            for (let part of parts) {
                if (part) {
                    current += "/" + part;
                    if (!fs.existsSync(current)) {
                        log.info("Creating directory: " + current);
                        fs.mkdirSync(current);
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}

module.exports = FielsHelper.instance;