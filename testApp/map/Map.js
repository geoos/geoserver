class Map extends ZCustomController {
    onThis_init() {
        this.map = L.map("mapContainer").setView([-33, -74], 6);
        this.baseLayer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            maxZoom: 17,
            attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        });

        this.baseLayer.addTo(this.map);
    }

    resized() {
        setTimeout(_ => this.map.invalidateSize(), 400);
    }
}
ZVC.export(Map)