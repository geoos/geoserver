class Main extends ZCustomController {
    onThis_init() {
        this.hideError();
        this.hideWorking();
        let url = document.location.href;
        let p = url.lastIndexOf("/test");
        if (p > 0) url = url.substr(0, p);
        this.edServerURL.value = url;
        this.connectedContainer.hide();
        this.geoServer = new GEOServerClient(this.edServerURL.value);
        this.geoServer.setWorkingListener({
            start:_ => this.showWorking(),
            stop:_ => this.hideWorking()
        })
        this.connect();
    }

    showError(msg) {
        this.errorMessage.text = msg;
        this.errorMessageContainer.show();
    }
    hideError() {this.errorMessageContainer.hide()}

    showWorking() {this.working.show()}
    hideWorking() {this.working.hide()}

    onEdServerURL_change() {this.connect()}

    async connect() {
        try {
            this.hideError()
            await this.dsLoader.load("./Empty")
            this.connectedContainer.hide()
            this.geoServer.setServerURL(this.edServerURL.value)
            let metadata = await this.geoServer.readMetadata()
            //console.log("metadata", metadata)
            this.connectedContainer.show()
            this.serverName.text = metadata.name;
            await this.refreshDataSets();
        } catch(error) {
            this.showError(error);            
        }
    }

    async refreshDataSets() {
        let providers = JSON.parse(JSON.stringify(this.geoServer.metadata.providers));
        this.geoServer.metadata.dataSets.forEach(ds => {
            ds._class = "bg-light text-dark"
            let p = providers.find(p => p.code == ds.provider);
            if (p) {
                if (!p.dataSets) p.dataSets = []
                p.dataSets.push(ds)
            }
        })
        this.edDataSet.setGroups(providers, "name", "dataSets");
        await this.refreshDataSetDetails();    
    }

    onEdDataSet_change() {
        this.refreshDataSetDetails();
    }

    async refreshDataSetDetails() {
        this.hideError();
        let dataSet = this.geoServer.metadata.dataSets.find(ds => ds.code == this.edDataSet.value);
        switch(dataSet.type) {
            case "raster":
                await this.dsLoader.load("./raster/Raster", {dataSet:dataSet, geoServer:this.geoServer, map:this.mapPanel.map})
                break;
            default: this.showError("DataSet type '" + dataSet.type + "' not handled");
        }
    }
}

ZVC.export(Main)