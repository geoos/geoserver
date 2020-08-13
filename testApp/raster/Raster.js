class Raster extends ZCustomController {
    async onThis_init(options) {
        this.dataSet = options.dataSet;
        this.geoServer = options.geoServer;
        this.map = options.map;
        this.time.refresh(this.dataSet);
        let self = this;
        $(this.iconPointWatcher.view).popover({
            trigger:"focus", container:"body", html:true, title:_ => (self.iconPointWatcher.popTitle), content:_ => (self.iconPointWatcher.popHtml)
        })
        $(this.iconIsolines.view).popover({
            trigger:"focus", html:true, title:_ => (self.iconIsolines.popTitle), content:_ => (self.iconIsolines.popHtml)
        })
        $(this.iconIsobands.view).popover({
            trigger:"focus", html:true, title:_ => (self.iconIsobands.popTitle), content:_ => (self.iconIsobands.popHtml)
        })
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
        if (this.isolinesAborter) {
            this.isolinesAborter.abort();
            this.isolinesAborter = null;
        }
        if (this.isobandsAborter) {
            this.isobandsAborter.abort();
            this.isobandsAborter = null;
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
        this.iconPointWatcher.hide()
        this.edIsolines.checked = false;
        this.iconIsolines.hide()
        this.edIsobands.checked = false;
        this.iconIsobands.hide();

        let v = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        if (v.queries.includes("valueAtPoint")) this.pointWatcher.show();
        else this.pointWatcher.hide();
        if (v.queries.includes("isolines")) this.isolines.show();
        else this.isonlines.hide();
        if (v.queries.includes("isobands")) this.isobands.show();
        else this.isonlines.hide();
    }

    onTime_change() {
        if (this.timerRefresh) {
            clearTimeout(this.timerRefresh)
            this.timerRefresh = null;
        }
        this.timerRefresh = setTimeout(_ => {
            this.timerRefresh = null;
            this.refresActiveVisualizers();
        }, 300)
    }

    refresActiveVisualizers() {
        if (this.edPointWatcher.checked) this.refreshPointWatcher();
        if (this.edIsolines.checked) this.refreshIsolines();
        if (this.edIsobands.checked) this.refreshIsobands();
    }

    setIconStatus(icon, status, popTitle, popContent) {
        icon.view.classList.remove("text-primary", "text-danger", "fa-info-circle", "fa-exclamation-circle", "fa-spin", "fa-spinner");
        if (status == "working") {
            icon.view.classList.add("fa-spin", "fa-spinner")
        } else if (status == "info") {
            icon.view.classList.add("fa-info-circle", "text-primary")
        } else if (status == "error") {
            icon.view.classList.add("fa-exclamation-circle", "text-danger")
        } else throw "Invalid icon status:" + status
        icon.show();
        if (!popTitle) popTitle = ""
        if (!popContent) popContent = "";
        let popHtml;
        if (typeof popContent == "string") {
            popHtml = "<div class='alert alert-danger'><i class='fas fa-exclamation-circle mr-2'></i>" + popContent + "</div>";
        } else {
            let v = this.dataSet.variables.find(v => v.code == this.edVariable.value);
            let unit  ="[" + v.unit + "]";
            popHtml = "<div style='min-width:300px;'><table width='100%' >"
            if (popContent.searchTime) popHtml += "<tr><td>Search Time</td><td>" + popContent.searchTime.formatted + "</td></tr>";
            if (popContent.foundTime) popHtml += "<tr><td>Found Time</td><td>" + popContent.foundTime.formatted + "</td></tr>";
            if (popContent.searchPoint) popHtml += "<tr><td>Search Point</td><td>[" + popContent.searchPoint.lat + ", " + popContent.searchPoint.lng + "]</td></tr>";
            if (popContent.foundPoint) popHtml += "<tr><td>Found Point</td><td>[" + popContent.foundPoint.lat + ", " + popContent.foundPoint.lng + "]</td></tr>";
            if (popContent.searchBox) {
                popHtml += "<tr><th colspan='2'>Search Area:</th></tr>";
                popHtml += "<tr><td class='text-right'>[North, West]</td><td>[" + popContent.searchBox.lat1 + ", " + popContent.searchBox.lng0 + "]</td></tr>";
                popHtml += "<tr><td class='text-right'>[South, East]</td><td>[" + popContent.searchBox.lat0 + ", " + popContent.searchBox.lng1 + "]</td></tr>";
            }
            if (popContent.foundBox) {
                popHtml += "<tr><th colspan='2'>Found Area:</th></tr>";
                popHtml += "<tr><td class='text-right'>[North, West]</td><td>[" + popContent.foundBox.lat1 + ", " + popContent.foundBox.lng0 + "]</td></tr>";
                popHtml += "<tr><td class='text-right'>[South, East]</td><td>[" + popContent.foundBox.lat0 + ", " + popContent.foundBox.lng1 + "]</td></tr>";
            }
            if (popContent.min !== undefined) popHtml += "<tr><td>[min, max]</td><td>[" + popContent.min + unit + ", " + popContent.max + unit + "]</td></tr>";
            if (popContent.increment) popHtml += "<tr><td>Used Increment</td><td>" + popContent.increment + unit + "</td></tr>";
            if (popContent.metadata) {
                popHtml += "<tr><th colspan='2'>Metadata:</th></tr>";
                for (name in popContent.metadata) {
                    if (name == "modelExecution") {
                        popHtml += "<tr><td>Model Execution</td><td>" + popContent.metadata[name].formatted + "</td></tr>";
                    } else {
                        popHtml += "<tr><td>" + name + "</td><td>" + JSON.stringify(popContent.metadata[name], null, 4) + "</td></tr>";
                    }
                }
            }
            popHtml += "</table></div>";            
        }
        icon.popTitle = popTitle;
        icon.popHtml = $(popHtml);
    }

    // Pont Watcher
    onEdPointWatcher_change() {
        if (this.edPointWatcher.checked) {
            let vis = new PointsVisualizer({
                zIndex:5,
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
            this.iconPointWatcher.hide();
        }
    }
    refreshPointWatcher() {
        this.setIconStatus(this.iconPointWatcher, "working");
        if (this.pointWatcherAborter) this.pointWatcherAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("pointWatcher");
        let monitorPoint = visualizer.getPoint("monitorPoint");
        let variable = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        monitorPoint.watching[0].label = variable.name + ": ...";
        monitorPoint.watching[0].color = "orange";
        visualizer.update();
        let {promise, controller} = this.geoServer.valueAtPoint(this.dataSet.code, this.edVariable.value, this.time.value.valueOf(), monitorPoint.lat, monitorPoint.lng);
        this.pointWatcherAborter = controller;
        promise.then(ret => {
            this.pointWatcherAborter = null;
            monitorPoint.watching[0].label = variable.name + ":" + this.geoServer.formatValue(this.dataSet.code, variable.code, ret.value, true);
            monitorPoint.watching[0].color = "white";
            visualizer.update();
            this.setIconStatus(this.iconPointWatcher, "info", "Value At Point", ret);
        }).catch(err => {
            this.pointWatcherAborter = null;
            if (err != "aborted") {
                monitorPoint.watching[0].label = variable.name + ":" + err.toString();
                monitorPoint.watching[0].color = "red";
                visualizer.update();
                this.setIconStatus(this.iconPointWatcher, "error", "Value At Point", "Error:" + err)
            } else {
                this.iconPointWatcher.hide();
            }
        })
    }

    // Isolines
    onEdIsolines_change() {
        if (this.edIsolines.checked) {
            this.konvaLeafletLayer.addVisualizer("isolines", new GeoJsonVisualizer({
                zIndex:3,
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
            this.iconIsolines.hide();
        }
    }

    refreshIsolines() {
        this.setIconStatus(this.iconIsolines, "working")
        if (this.isolinesAborter) this.isolinesAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("isolines");
        let b = this.map.getBounds();
        let {promise, controller} = this.geoServer.isolines(this.dataSet.code, this.edVariable.value, this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast());
        this.isolinesAborter = controller;
        promise.then(ret => {
            this.isolinesAborter = null;
            visualizer.setGeoJson(ret.geoJson, ret.markers);
            this.setIconStatus(this.iconIsolines, "info", "Isolines", ret)
        }).catch(err => {
            this.isolinesAborter = null;
            if (err != "aborted") {
                console.error(err);
                this.setIconStatus(this.iconIsolines, "error", "Isolines", "Error:" + err);
            } else {
                this.iconIsolines.hide();
            }
            visualizer.setGeoJson(null);
        })
    }

    // Isobands
    onEdIsobands_change() {
        if (this.edIsobands.checked) {
            this.konvaLeafletLayer.addVisualizer("isobands", new GeoJsonVisualizer({
                zIndex:1,
                onBeforeUpdate: _ => {this.refreshIsobands(); return false},
                polygonStyle:f => {
                    let value = (f.properties.minValue + f.properties.maxValue) / 2;
                    let color = "rgba(0,0,0,0)"
                    if (value !== undefined && value >= this.isobandsMetadata.min && value <= this.isobandsMetadata.max) {
                        let v = (value - this.isobandsMetadata.min) / (this.isobandsMetadata.max - this.isobandsMetadata.min);
                        let hue=((1-v)*120).toString(10);
                        color = ["hsl(",hue,",100%,50%)"].join("");
                    }
                    return {fill:color, opacity:0.6}
                }
            }));
            this.refreshIsobands();
        } else {
            if (this.isobandsAborter) {
                this.isobandsAborter.abort();
                this.isobandsAborter = null;
            }
            this.konvaLeafletLayer.removeVisualizer("isobands");
            this.iconIsobands.hide();
        }
    }

    refreshIsobands() {
        this.setIconStatus(this.iconIsobands, "working")
        if (this.isobandsAborter) this.isobandsAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("isobands");
        let b = this.map.getBounds();
        let {promise, controller} = this.geoServer.isobands(this.dataSet.code, this.edVariable.value, this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast());
        this.isobandsAborter = controller;
        promise.then(ret => {
            this.bandsAborter = null;
            this.isobandsMetadata = ret;
            visualizer.setGeoJson(ret.geoJson);
            this.setIconStatus(this.iconIsobands, "info", "Isobands", ret)
        }).catch(err => {
            this.isobandsAborter = null;
            if (err != "aborted") {
                console.error(err);
                this.setIconStatus(this.iconIsobands, "error", "Isobands", "Error:" + err)
            } else {
                this.iconIsobands.hide()
            }
            visualizer.setGeoJson(null);
        })
    }
}
ZVC.export(Raster)