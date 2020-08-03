
class Config {
    static get instance() {
        if (Config.singleton) return Config.singleton;
        Config.singleton = new Config();
        return Config.singleton;
    }

    get timeZone() {return process.env.TIME_ZONE || "America/Santiago"}
    get logLevel() {return (process.env.LOG_LEVEL || "info").toLowerCase()}
    get logRetain() {return parseInt(process.env.LOG_RETAIN || "30")}
    get logPrefix() {return (process.env.LOG_PREFIX || "geoos-provider-")}

    get dataPath() {return "/home/data"}
}

module.exports = Config.instance;