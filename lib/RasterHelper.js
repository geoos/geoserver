

class RasterHelper {
    static get instance() {
        if (RasterHelper.singleton) return RasterHelper.singleton;
        RasterHelper.singleton = new RasterHelper();
        return RasterHelper.singleton;
    }

    fromGDALLng(lng) {return lng > 180?lng - 360:lng}
    toGDALLng(lng) {return lng < 0?360 + lng:lng}

    normalizeBox(world, box) {
        let b = {lng0:box.lng0, lat0:box.lat0, lng1:box.lng1, lat1:box.lat1}
        // Fix bounds clipping into world
        if (b.lng0 < world.lng0) b.lng0 = world.lng0;
        if (b.lat0 < world.lat0) b.lat0 = world.lat0;
        if (b.lng1 > world.lng1) b.lng1 = world.lng1
        if (b.lat1 > world.lat1) b.lat1 = world.lat1;
        // Adjust to grid
        let _lng0 = world.lng0 + parseInt((b.lng0 - world.lng0) / world.dLng) * world.dLng;
        let _lat0 = world.lat0 + parseInt((box.lat0 - world.lat0) / world.dLat) * world.dLat;
        let _lng1 = world.lng0 + parseInt((b.lng1 - world.lng0) / world.dLng) * world.dLng;
        let _lat1 = world.lat0 + parseInt((b.lat1 - world.lat0) / world.dLat) * world.dLat;
        // Expand if neccesary
        if (_lng1 < b.lng1) _lng1 += world.dLng;
        if (_lat1 < b.lat1) _lat1 += world.dLat;
        // Pixels
        let worldHeight = (world.lat1 - world.lat0) / world.dLat;
        let x0 = (_lng0 - world.lng0) / world.dLng;
        let y0 = worldHeight - (_lat1 - world.lat0) / world.dLat;
        let x1 = (_lng1 - world.lng0) / world.dLng;
        let y1 = worldHeight - (_lat0 - world.lat0) / world.dLat;
        let width = x1 - x0;
        let height = y1 - y0;

        return {
            lng0:_lng0, lat0:_lat0, lng1:_lng1, lat1:_lat1, 
            dLng:world.dLng, dLat:world.dLat,
            x0, y0, x1, y1, width, height
        }
    }
}

module.exports = RasterHelper.instance;