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

        let v = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        if (v.queries.includes("valueAtPoint")) this.pointWatcher.show();
        else this.pointWatcher.hide();
    }

    onEdPointWatcher_change() {
        if (this.edPointWatcher.checked) {
            let vis = new PointsVisualizer({
                onPointMoved:p => {
                    console.log("point moved", p)
                    this.refreshPointWatcher();
                }
            });
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
        let monitorPoint = this.konvaLeafletLayer.getVisualizer("pointWatcher").getPoint("monitorPoint");
        let variable = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        monitorPoint.watching[0].label = variable.name + ": ...";
        monitorPoint.watching[0].color = "orange";
        this.konvaLeafletLayer.getVisualizer("pointWatcher").update();
        let {promise, controller} = this.geoServer.valueAtPoint(this.dataSet.code, this.edVariable.value, "now", monitorPoint.lat, monitorPoint.lng);
        this.pointWatcherAborter = controller;
        promise.then(ret => {
            console.log("retorna ok", ret);
            this.pointWatcherAborter = null;
            monitorPoint.watching[0].label = variable.name + ":" + ret.value;
            monitorPoint.watching[0].color = "white";
            this.konvaLeafletLayer.getVisualizer("pointWatcher").update();
        }).catch(err => {
            this.pointWatcherAborter = null;
            if (err != "aborted") {
                monitorPoint.watching[0].label = variable.name + ":" + err.toString();
                monitorPoint.watching[0].color = "red";
                this.konvaLeafletLayer.getVisualizer("pointWatcher").update();
            }
        })
    }
}
ZVC.export(Raster)