L.KonvaCustomLayer = L.Layer.extend({
    options:{
        wrapper:null
    },
    initialize:function(options) {
        L.setOptions(this, options);
    },
    onAdd:function(map) {
        this.options.wrapper.onAdd();
        map.on('moveend', this._update, this);
    },
    onRemove:function(map) {
        this.options.wrapper.onRemove();
        map.off('moveend', this._update, this);
    },
    _update:function(evt) {
        this.options.wrapper.doUpdate(evt);
    }
}) 

class KonvaLeafletLayer {
    constructor(map, zIndex, options) {
        this.options = options;
        this.map = map;        
        this.uniqueId = parseInt(Math.random() * 99999999);
        let paneName = "geoos" + this.uniqueId;
        map.createPane(paneName);
        //map.getPane(paneName).style.pointerEvents = "none";
        map.getPane(paneName).style.zIndex = zIndex;
        this.leafletLayer = new L.KonvaCustomLayer({wrapper:this, pane:paneName});
        this.visualizers = []
    }
    get lOptions() {return this.leafletLayer.options}
    get lPane() {return this.map.getPane(this.lOptions.pane)}

    addTo(map) {
        this.leafletLayer.addTo(map);
    }
    removeFrom(map) {
        map.removeLayer(this.leafletLayer);
    }
    onAdd() {
        this.container = L.DomUtil.create("DIV");
        this.container.id = "kstage" + this.uniqueId;
        this.lPane.appendChild(this.container);
        this.konvaStage = new Konva.Stage({
            id:this.uniqueId,
            container:"kstage" + this.uniqueId,
            width:500, height:500
        })
        this.visualizers.forEach(v => this.konvaStage.add(v.visualizer.konvaLayer))
        this.doUpdate();
    }
    onRemove() {
        this.konvaStage.destroy();
        this.visualizers = [];
        L.DomUtil.remove(this.container);
    }
    doUpdate(evt) {        
        let bounds = this.map.getBounds();
        let p0 = this.map.latLngToLayerPoint(bounds.getNorthWest());
        let p1 = this.map.latLngToLayerPoint(bounds.getSouthEast());        
        L.DomUtil.setPosition(this.container, p0);
        this.konvaStage.width(p1.x - p0.x);
        this.konvaStage.height(p1.y - p0.y);
        this._dx = p0.x; this._dy = p0.y;
        this.visualizers.forEach(v => {
            let ret = v.visualizer.beforeUpdate();
            if (ret !== false) {
                v.visualizer.update()
                v.visualizer.afterUpdate()
            }
        })
    }
    addVisualizer(id, visualizer) {
        this.visualizers.push({id:id, visualizer:visualizer});
        visualizer.stageLayer = this;
        this.konvaStage.add(visualizer.konvaLayer);
        visualizer.update();
    }
    getVisualizer(id) {
        let v = this.visualizers.find(v => v.id == id);
        return v?v.visualizer:null;
    }
    removeVisualizer(id) {
        let idx = this.visualizers.findIndex(v => v.id == id);
        if (idx >= 0) {
            this.visualizers[idx].visualizer.destroy();
            this.visualizers.splice(idx, 1);
        }
    }
    clear() {
        this.visualizers.forEach(v => v.visualizer.destroy())
        this.visualizers = [];
    }
}

class KonvaLeafletVisualizer {
    constructor(options) {
        this.options = options || {}
        this.konvaLayer = new Konva.Layer();
        this.stageLayer = null; // assigned in "addVisualizer"
    }
    get map() {return this.stageLayer.map}

    toCanvas(mapPoint) {
        let p = this.map.latLngToLayerPoint(mapPoint);
        return {x:p.x - this.stageLayer._dx, y:p.y - this.stageLayer._dy}
    }
    toMap(point) {
        return this.map.layerPointToLatLng({x:point.x + this.stageLayer._dx, y:point.y + this.stageLayer._dy})
    }

    destroy() {
        this.konvaLayer.destroy()
    }
    beforeUpdate() {
        if (this.options.onBeforeUpdate) this.options.onBeforeUpdate();
    }
    afterUpdate() {
        if (this.options.onAfterUpdate) this.options.onAfterUpdate();
    }
    update() {
        console.log("visualizer update not overwritten");
    }
}
