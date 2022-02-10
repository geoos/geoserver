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
        $(this.iconShader.view).popover({
            trigger:"focus", html:true, title:_ => (self.iconShader.popTitle), content:_ => (self.iconShader.popHtml)
        })
        $(this.iconVectors.view).popover({
            trigger:"focus", html:true, title:_ => (self.iconVectors.popTitle), content:_ => (self.iconVectors.popHtml)
        })
        $(this.iconDataPoints.view).popover({
            trigger:"focus", html:true, title:_ => (self.iconDataPoints.popTitle), content:_ => (self.iconDataPoints.popHtml)
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
        if (this.shaderAborter) {
            this.shaderAborter.abort();
            this.shaderAborter = null;
        }
        if (this.vectorsAborter) {
            this.vectorsAborter.abort();
            this.vectorsAborter = null;
        }
        if (this.dataPointsAborter) {
            this.dataPointsAborter.abort();
            this.dataPointsAborter = null;
        }
        this.konvaLeafletLayer.removeFrom(this.map);
    }

    refreshVariables() {
        this.edVariable.setRows(this.dataSet.variables);
        this.refreshQueries();
    }

    onEdVariable_change() {this.refreshQueries()}

    refreshQueries() {        
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
        if (this.shaderAborter) {
            this.shaderAborter.abort();
            this.shaderAborter = null;
        }
        if (this.vectorsAborter) {
            this.vectorsAborter.abort();
            this.vectorsAborter = null;
        }
        if (this.dataPointsAborter) {
            this.dataPointsAborter.abort();
            this.dataPointsAborter = null;
        }
        let variable = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        if (variable && variable.levels && variable.levels.length > 1) {
            this.edLevel.setRows(variable.levels.map((l, i) => ({index:i, name:l})))
            this.edLevel.show();
        } else {
            this.edLevel.hide();
        }
        this.konvaLeafletLayer.clear();
        this.edPointWatcher.checked= false;
        this.iconPointWatcher.hide()
        this.edIsolines.checked = false;
        this.iconIsolines.hide()
        this.edIsobands.checked = false;
        this.iconIsobands.hide();
        this.edShader.checked = false;
        this.iconShader.hide();
        this.edVectors.checked = false;
        this.iconVectors.hide();
        this.edDataPoints.checked = false;
        this.iconDataPoints.hide();

        let v = this.dataSet.variables.find(v => v.code == this.edVariable.value);
        if (v.queries.includes("valueAtPoint")) this.pointWatcher.show();
        else this.pointWatcher.hide();
        if (v.queries.includes("isolines")) this.isolines.show();
        else this.isonlines.hide();
        if (v.queries.includes("isobands")) this.isobands.show();
        else this.isonlines.hide();
        if (v.queries.includes("grid")) {
            this.shader.show();
            this.dataPoints.show();
        } else {
            this.shader.hide();
            this.dataPoints.hide();
        }
        if (v.queries.includes("vectorsGrid")) this.vectors.show();
        else this.vectors.hide();
    }

    async onEdLevel_change() {
        await this.refresActiveVisualizers()
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
        if (this.edShader.checked) this.refreshShader();
        if (this.edVectors.checked) this.refreshVectors();
        if (this.edDataPoints.checked) this.refreshDataPoints();
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
        let time;
        if (this.dataSet.temporality != "none") time = this.time.value.valueOf()
        let {promise, controller} = this.geoServer.valueAtPoint(this.dataSet.code, this.edVariable.value, time, monitorPoint.lat, monitorPoint.lng, this.edLevel.value);
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
        let {promise, controller} = this.geoServer.isolines(this.dataSet.code, this.edVariable.value, this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast(), this.edLevel.value);
        this.isolinesAborter = controller;
        promise.then(ret => {
            this.isolinesAborter = null;
            visualizer.setGeoJson(ret.geoJson, ret.markers.length < 1000?ret.markers:null);
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
        let {promise, controller} = this.geoServer.isobands(this.dataSet.code, this.edVariable.value, this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast(), this.edLevel.value);
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

    // Shader
    onEdShader_change() {
        if (this.edShader.checked) {
            this.konvaLeafletLayer.addVisualizer("shader", new ShaderVisualizer({
                zIndex:2,
                onBeforeUpdate: _ => {this.refreshShader(); return false},
                pointColor: value => {
                    let color = "rgba(0,0,0,0)"
                    if (value !== undefined && value >= this.shaderMetadata.min && value <= this.shaderMetadata.max) {
                        let v = (value - this.shaderMetadata.min) / (this.shaderMetadata.max - this.shaderMetadata.min);
                        let hue=((1-v)*120).toString(10);
                        color = ["hsla(",hue,",100%,50%, 0.7)"].join("");
                    }
                    return color;
                }
            }));
            this.refreshShader();
        } else {
            if (this.shaderAborter) {
                this.shaderAborter.abort();
                this.shaderAborter = null;
            }
            this.konvaLeafletLayer.removeVisualizer("shader");
            this.iconShader.hide();
        }
    }

    refreshShader() {
        this.setIconStatus(this.iconShader, "working")
        if (this.shaderAborter) this.shaderAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("shader");
        let b = this.map.getBounds();
        let {promise, controller} = this.geoServer.grid(
            this.dataSet.code, this.edVariable.value, 
            this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast(),            
            1, this.edLevel.value            
        );
        this.shaderAborter = controller;
        promise.then(ret => {
            this.shaderAborter = null;
            this.shaderMetadata = ret;
            visualizer.setGridData(ret.foundBox, ret.rows, ret.nrows, ret.ncols);
            this.setIconStatus(this.iconShader, "info", "Shader", ret)
        }).catch(err => {
            this.shaderAborter = null;
            if (err != "aborted") {
                console.error(err);
                this.setIconStatus(this.iconShader, "error", "Shader", "Error:" + err)
            } else {
                this.iconShader.hide()
            }
            visualizer.setGridData(null, null, null, null);
        })
    }

    // Vectors
    onEdVectors_change() {
        if (this.edVectors.checked) {
            this.konvaLeafletLayer.addVisualizer("vectors", new VectorsVisualizer({
                zIndex:4,
                onBeforeUpdate: _ => {this.refreshVectors(); return false},
                vectorColor: value => {
                    return "black"
                    /*
                    let color = "rgba(0,0,0,0)"
                    if (value !== undefined && value >= this.vectorsMetadata.min && value <= this.vectorsMetadata.max) {
                        let v = (value - this.vectorsMetadata.min) / (this.vectorsMetadata.max - this.vectorsMetadata.min);
                        let hue=((1-v)*120).toString(10);
                        color = ["hsla(",hue,",100%,50%, 0.7)"].join("");
                    }
                    return color;
                    */
                }
            }));
            this.refreshVectors();
        } else {
            if (this.vectorsAborter) {
                this.vectorsAborter.abort();
                this.vectorsAborter = null;
            }
            this.konvaLeafletLayer.removeVisualizer("vectors");
            this.iconVectors.hide();
        }
    }

    refreshVectors() {
        this.setIconStatus(this.iconVectors, "working")
        if (this.vectorsAborter) this.vectorsAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("vectors");
        let b = this.map.getBounds();
        let {promise, controller} = this.geoServer.vectorsGrid(
            this.dataSet.code, this.edVariable.value, 
            this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast(),
            1, this.edLevel.value
        );
        this.vectorsAborter = controller;
        promise.then(ret => {
            this.vectorsAborter = null;
            this.vectorsMetadata = ret;
            visualizer.setVectorData(ret.foundBox, ret.rowsU, ret.rowsV, ret.nrows, ret.ncols);
            this.setIconStatus(this.iconVectors, "info", "Vectors", ret)
        }).catch(err => {
            this.vectorsAborter = null;
            if (err != "aborted") {
                console.error(err);
                this.setIconStatus(this.iconVectors, "error", "Vectors", "Error:" + err)
            } else {
                this.iconVectors.hide()
            }
            visualizer.setVectorData(null, null, null, null, null);
        })
    }

    // DataPoints
    onEdDataPoints_change() {
        if (this.edDataPoints.checked) {
            this.konvaLeafletLayer.addVisualizer("dataPoints", new DataPointsVisualizer({
                zIndex:3,
                onBeforeUpdate: _ => {this.refreshDataPoints(); return false}
            }));
            this.refreshDataPoints();
        } else {
            if (this.dataPointsAborter) {
                this.dataPointsAborter.abort();
                this.dataPointsAborter = null;
            }
            this.konvaLeafletLayer.removeVisualizer("dataPoints");
            this.iconDataPoints.hide();
        }
    }

    refreshDataPoints() {
        this.setIconStatus(this.iconDataPoints, "working")
        if (this.dataPointsAborter) this.dataPointsAborter.abort();
        let visualizer = this.konvaLeafletLayer.getVisualizer("dataPoints");
        let b = this.map.getBounds();
        let {promise, controller} = this.geoServer.grid(
            this.dataSet.code, this.edVariable.value, 
            this.time.value.valueOf(), b.getNorth(), b.getWest(), b.getSouth(), b.getEast(),            
            1, this.edLevel.value            
        );
        this.dataPointsAborter = controller;
        promise.then(ret => {
            this.dataPointsAborter = null;
            this.datapointsMetadata = ret;
            visualizer.setGridData(ret.foundBox, ret.rows, ret.nrows, ret.ncols);
            this.setIconStatus(this.iconDataPoints, "info", "Data Points", ret)
        }).catch(err => {
            this.dataPointsAborter = null;
            if (err != "aborted") {
                console.error(err);
                this.setIconStatus(this.iconDataPoints, "error", "Data Points", "Error:" + err)
            } else {
                this.iconDataPoints.hide()
            }
            visualizer.setGridData(null, null, null, null);
        })
    }
}
ZVC.export(Raster)