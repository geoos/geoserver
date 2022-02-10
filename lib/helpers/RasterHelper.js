

class RasterHelper {
    static get instance() {
        if (RasterHelper.singleton) return RasterHelper.singleton;
        RasterHelper.singleton = new RasterHelper();
        return RasterHelper.singleton;
    }

    /*
    from360Lng(lng) {return lng > 180?lng - 360:lng}
    to360Lng(lng) {return lng < 0?360 + lng:lng}
    */

    /*
    normalizeBox_old(world0, box, lngCorrection="left") {
        let b = {lng0:this.to360Lng(box.lng0), lat0:box.lat0, lng1:this.to360Lng(box.lng1), lat1:box.lat1}
        if (b.lng0 >= b.lng1) b.lng0 -= 360;
        if (b.lng0 < 0 || b.lng1 < 0) {b.lng0 += 360; b.lng1 += 360}
        let world = JSON.parse(JSON.stringify(world0));
        world.lng0 = this.to360Lng(world.lng0);
        world.lng1 = this.to360Lng(world.lng1);
        if (world.lng0 >= world.lng1) {
            console.log("correcting lng for", world0, world, box, lngCorrection);
            if (!lngCorrection || lngCorrection == "left") world.lng0 -= 360;
            else world.lng1 += 360;
        }

        // Fix bounds clipping into world
        if (b.lng0 < world.lng0) b.lng0 = world.lng0;
        if (b.lat0 < world.lat0) b.lat0 = world.lat0;
        if (b.lng1 > world.lng1) b.lng1 = world.lng1
        if (b.lat1 > world.lat1) b.lat1 = world.lat1;
        // Adjust to grid
        let _lng0 = world.lng0 + parseInt((b.lng0 - world.lng0) / world.dLng) * world.dLng;
        let _lat0 = world.lat0 + parseInt((b.lat0 - world.lat0) / world.dLat) * world.dLat;
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
        if (width <= 0 || height <= 0) {
            console.log("width o or height negative", width, height, "lngCorrection", lngCorrection);
        }

        return {
            lng0:this.from360Lng(_lng0), lat0:_lat0, lng1:this.from360Lng(_lng1), lat1:_lat1, 
            dLng:world.dLng, dLat:world.dLat,
            x0, y0, x1, y1, width, height
        }
    }
    */

    from360Lng(lng) {return lng > 180?lng - 360:lng}
    to360Lng(lng) {return lng < 0?360 + lng:lng}
    boxTo360(b) {
        b.lng0 = this.to360Lng(b.lng0);
        b.lng1 = this.to360Lng(b.lng1);
        if (b.lng0 > b.lng1) {let swap = b.lng0; b.lng0 = b.lng1; b.lng1 = swap}
    }
    boxFrom360(b) {
        b.lng0 = this.from360Lng(b.lng0);
        b.lng1 = this.from360Lng(b.lng1);
        if (b.lng0 > b.lng1) {let swap = b.lng0; b.lng0 = b.lng1; b.lng1 = swap}
    }

    normalizeBox(world0, box) {
        let b = JSON.parse(JSON.stringify(box));
        let world = JSON.parse(JSON.stringify(world0));

        let is0To360World = world.lng0 > 180 || world.lng1 > 180;
        // if it is a 0-360 world, fix query box (always -180 to 180) to match world coordinates
        if (is0To360World) this.boxTo360(b);

        // Fix bounds clipping into world
        if (b.lng0 < world.lng0) b.lng0 = world.lng0;
        if (b.lat0 < world.lat0) b.lat0 = world.lat0;
        if (b.lng1 > world.lng1) b.lng1 = world.lng1
        if (b.lat1 > world.lat1) b.lat1 = world.lat1;
        // Adjust to grid
        let _lng0 = world.lng0 + parseInt((b.lng0 - world.lng0) / world.dLng) * world.dLng;
        let _lat0 = world.lat0 + parseInt((b.lat0 - world.lat0) / world.dLat) * world.dLat;
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

        let retBox = {
            lng0:_lng0, lat0:_lat0, lng1:_lng1, lat1:_lat1, 
            dLng:world.dLng, dLat:world.dLat,
            x0, y0, x1, y1, width, height
        }
        // if it is a 0-360 world, fix return box to match query box (always -180 to 180)
        if (is0To360World) this.boxFrom360(retBox);
        return retBox;
    }

    normalizePoint(varMetadata, _lat, _lng) {
        let world = varMetadata.world;
        let is0To360World = world.lng0 > 180 || world.lng1 > 180;
        let lat = _lat, lng = _lng;
        if (is0To360World) lng = this.to360Lng(lng);        

        let x = parseInt((lng - world.lng0) / world.dLng);
        let y = parseInt((lat - world.lat0) / world.dLat);

        let retPoint = {
            lng:world.lng0 + x * world.dLng + world.dLng / 2,
            lat:world.lat0 + y * world.dLat + world.dLat/2,
            x:x,
            y:world.height - y
        }
        if (is0To360World) retPoint.lng = this.from360Lng(retPoint.lng);
        return retPoint;
    }
}

module.exports = RasterHelper.instance;