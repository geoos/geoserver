class GEOServerClient {
    constructor(serverURL) {        
        this.serverURL = serverURL;
        this.workingListener = null;
        this.nWorking = 0;
    }

    setServerURL(serverURL) {
        this.serverURL = serverURL
        if (this.serverURL.endsWith("/")) this.serverURL = this.serverURL.substr(0, this.serverURL.length - 1);
    }
    setWorkingListener(l) {this.workingListener = l}

    async _incWorking() {
        if (++this.nWorking == 1 && this.workingListener) await this.workingListener.start();   
    }
    async _decWorking() {
        if (!(--this.nWorking) && this.workingListener) await this.workingListener.stop();
    }

    _getJSON(url, args, signal) {
        let urlArgs = "";
        for (const argName in args) {
            urlArgs = urlArgs?(urlArgs + "&"):"?";
            urlArgs += argName + "=" + encodeURI(args[argName]);
        }
        this._incWorking();
        return new Promise((resolve, reject) => {
            fetch(this.serverURL + "/" + url + urlArgs, {signal:signal})
                .then(res => {
                    if (res.status != 200) {
                        this._decWorking()
                        res.text()
                            .then(txt => reject(txt))
                            .catch(_ => reject(res.statusText))
                        return;
                    }
                    res.json()
                        .then(json => {this._decWorking(); resolve(json)})
                        .catch(err => {this._decWorking(); reject(err)})
                })
                .catch(err => {
                    console.log("falla fetch")
                    this._decWorking();
                    reject(err.name == "AbortError"?"aborted":err)
                });
        })
    }
    async readMetadata() {
        this.metadata = await this._getJSON("metadata");
        return this.metadata;
    }

    valueAtPoint(dataSetCode, varCode, time, lat, lng) {
        let controller = new AbortController();
        return {
            promise:this._getJSON(dataSetCode + "/" + varCode + "/valueAtPoint", {time, lat, lng}, controller.signal),
            controller:controller
        }
    }
}