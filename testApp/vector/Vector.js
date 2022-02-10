class Vector extends ZCustomController {
    async onThis_init(options) {
        this.dataSet = options.dataSet;
        this.geoServer = options.geoServer;
        this.map = options.map;
        this.time.refresh(this.dataSet);
    }

    onThis_activated() {
        this.konvaLeafletLayer = new KonvaLeafletLayer(this.map, 200);
        this.konvaLeafletLayer.addTo(this.map);
        this.konvaLeafletLayer.addVisualizer("geoJsonTiles", new VectorTilesVisualizer({
            zIndex:1,
            getTile: (z, x, y) => {
                let time;
                if (!this.edFiles.value) return {promise:null, aborter:null};
                if (this.dataSet.temporality != "none") time = this.time.value.valueOf()
                return this.geoServer.fileGeoJsonTile(this.dataSet.code, this.edFiles.value, time, z, x, y);
            }
        }));
        this.refreshFiles();
    }
    onThis_deactivated() {
        if (this.fileMetadataAborter) this.fileMetadataAborter.abort();
        this.konvaLeafletLayer.removeFrom(this.map);
    }

    refreshFiles() {
        this.edFiles.setRows(this.dataSet.files);
        this.refreshFile();
    }

    onEdFiles_change() {this.refreshFile()}

    async refreshFile() {
        if (this.fileMetadataAborter) this.fileMetadataAborter.abort();
        let fileName = this.edFiles.value;
        let time;
        if (this.dataSet.temporality != "none") time = this.time.value.valueOf()
        let {promise, controller} = this.geoServer.fileMetadata(this.dataSet.code, fileName, time);
        this.fileMetadataAborter = controller;
        this.objects = {};
        this.cntObjects.html = "<div><i class='fas fa-spin fa-spinner fa-lg mr-2 float-left'></i>Loading Metadata ...</div>";
        promise.then(ret => {
            let html = "";
            if (ret.objects) {
                html = "<h4>" + ret.objects.length + " objects</h4>";
                ret.objects.sort((o1, o2) => (o2.center.lat - o1.center.lat))
                let n = 0;
                for (let obj of ret.objects) {
                    if (++n < 500) html += "<div data-z-idx=''>" + obj.name + "<div>"
                    if (obj.id) this.objects[obj.id] = obj;
                }
            }
            this.cntObjects.html = html;
            this.konvaLeafletLayer.getVisualizer("geoJsonTiles").reset();
        }).catch(err => console.error(err));
    }
}
ZVC.export(Vector)