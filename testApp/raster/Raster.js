class Raster extends ZCustomController {
    async onThis_init(options) {
        this.dataSet = options.dataSet;
        this.geoServer = options.geoServer;
        this.map = options.map;
    }

    onThis_activated() {
        this.konvaLeafletLayer = new KonvaLeafletLayer(this.map, 200);
        this.konvaLeafletLayer.addTo(this.map);
        this.refreshVariables();
    }
    onThis_deactivated() {
        if (this.pointWatcherAborter) {
            this.pointWatcherAborter.abort();
            this.pointWatcherAborter = null;
        }
        this.konvaLeafletLayer.removeFrom(this.map);
    }

    refreshVariables() {
        this.edVariable.setRows(this.dataSet.variables);
        this.refreshQueries();
    }

    onEdVariable_change() {this.refreshQueries()}

    refreshQueries() {        
        console.log("DataSet", this.dataSet)
        if (this.pointWatcherAborter) {
            this.pointWatcherAborter.abort();
            this.pointWatcherAborter = null;
        }
        this.konvaLeafletLayer.clear();
        this.edPointWatcher.checked= false;
        this.edIsolines.checked = false;

        let v = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        if (v.queries.includes("valueAtPoint")) this.pointWatcher.show();
        else this.pointWatcher.hide();
        if (v.queries.includes("isolines")) this.isolines.show();
        else this.isonlines.hide();
    }

    // Pont Watcher
    onEdPointWatcher_change() {
        if (this.edPointWatcher.checked) {
            let vis = new PointsVisualizer({
                onPointMoved:p => this.refreshPointWatcher()}
            );
            let variable = this.dataSet.variables.find(v => v.code == this.edVariable.value);
            let center = this.map.getCenter();
            vis.addPoint({id:"monitorPoint", lat:center.lat, lng:center.lng, options:{draggable:true}, watching:[{
                id:variable.code, label:variable.name + ": ...", color:"orange"
            }]})
            this.konvaLeafletLayer.addVisualizer("pointWatcher", vis);
            this.refreshPointWatcher();
        } else {
            if (this.pointWatcherAborter) {
                this.pointWatcherAborter.abort();
                this.pointWatcherAborter = null;
            }
            this.konvaLeafletLayer.removeVisualizer("pointWatcher");
        }
    }
    refreshPointWatcher() {
        if (this.pointWatcherAborter) this.pointWatcherAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("pointWatcher");
        let monitorPoint = visualizer.getPoint("monitorPoint");
        let variable = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        monitorPoint.watching[0].label = variable.name + ": ...";
        monitorPoint.watching[0].color = "orange";
        visualizer.update();
        let {promise, controller} = this.geoServer.valueAtPoint(this.dataSet.code, this.edVariable.value, "now", monitorPoint.lat, monitorPoint.lng);
        this.pointWatcherAborter = controller;
        promise.then(ret => {
            this.pointWatcherAborter = null;
            monitorPoint.watching[0].label = variable.name + ":" + this.geoServer.formatValue(this.dataSet.code, variable.code, ret.value, true);
            monitorPoint.watching[0].color = "white";
            visualizer.update();
        }).catch(err => {
            this.pointWatcherAborter = null;
            if (err != "aborted") {
                monitorPoint.watching[0].label = variable.name + ":" + err.toString();
                monitorPoint.watching[0].color = "red";
                visualizer.update();
            }
        })
    }

    // Isolines
    onEdIsolines_change() {
        if (this.edIsolines.checked) {
            this.konvaLeafletLayer.addVisualizer("isolines", new GeoJsonVisualizer({
                onBeforeUpdate: _ => {this.refreshIsolines(); return false},
                lineStyle:{stroke:"black", strokeWidth:1.2, hitStrokeWidth:0, perfectDrawEnabled:false, listenning:false, tension:0.2},
                markerLabel:m => (this.geoServer.formatValue(this.dataSet.code, this.edVariable.value, m.value, false))
            }));
            this.refreshIsolines();
        } else {
            if (this.isolinesAborter) {
                this.isolinesAborter.abort();
                this.isolinesAborter = null;
            }
            this.konvaLeafletLayer.removeVisualizer("isolines");
        }
    }

    refreshIsolines() {
        if (this.isolinesAborter) this.isolinesAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("isolines");
        let b = this.map.getBounds();
        let {promise, controller} = this.geoServer.isolines(this.dataSet.code, this.edVariable.value, "now", b.getNorth(), b.getWest(), b.getSouth(), b.getEast());
        this.pointWatcherAborter = controller;
        promise.then(ret => {
            this.isolinesAborter = null;
            visualizer.setGeoJson(ret.geoJson, ret.markers);
        }).catch(err => {
            this.isolinesAborter = null;
            if (err != "aborted") {
                console.error(err);
            }
            visualizer.setGeoJson(null);
        })
    }
}
ZVC.export(Raster)