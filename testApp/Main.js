class Main extends ZCustomController {
    onThis_init() {
        this.collapsed.hide();
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
        if (!this.geoServer.metadata.providers || !this.geoServer.metadata.providers.length || !this.geoServer.metadata.dataSets || !this.geoServer.metadata.dataSets.length) {
            this.showError("No datasets defined in config.hjson");
            return;
        }
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
            case "vector":
                await this.dsLoader.load("./vector/Vector", {dataSet:dataSet, geoServer:this.geoServer, map:this.mapPanel.map})
                break;
            default: this.showError("DataSet type '" + dataSet.type + "' not handled");
        }
    }

    onCollapse_click() {
        console.log("collapse");
        this.collapsed.show();
        this.leftTop.hide();
        this.leftBottom.view.classList.remove("d-flex");
        this.leftBottom.hide();
        this.left.view.style.flex = "0 0 40px"
        this.mapPanel.resized();
    }
    onExpand_click() {
        console.log("expand");
        this.leftTop.show();
        this.leftBottom.view.classList.add("d-flex");
        this.leftBottom.show();
        this.collapsed.hide();
        this.left.view.style.flex = "0 0 300px"
        this.mapPanel.resized();
    }
}

ZVC.export(Main)