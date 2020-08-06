const moment = require("moment-timezone");

class TimeHelper {
    static get instance() {
        if (TimeHelper.singleton) return TimeHelper.singleton;
        TimeHelper.singleton = new TimeHelper();
        return TimeHelper.singleton;
    }

    getTimeInFileName(dataSetCode, dataSet, fileName) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return null;
        if (time.unit.toLowerCase().startsWith("hour")) {
            // timeformat: UTC: YYYY-MM-DD_HH-mm
            let dt = fileName.substr(dataSetCode.length + 1);
            let fileTime = moment.tz(dt, "YYYY-MM-DD_HH-mm", "UTC");
            return fileTime
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }
    getTimeForFileName(dataSetCode, dataSet, timeValue) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return null;
        if (time.unit.toLowerCase().startsWith("hour")) {
            // timeformat: UTC: YYYY-MM-DD_HH-mm
            return timeValue.format("YYYY-MM-DD_HH-mm");            
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }

    validateTimeForDataSet(dataSetCode, dataSet, timeValue) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return;
        if (time.unit.toLowerCase().startsWith("hour")) {
            // timeformat: UTC: YYYY-MM-DD_HH-mm
            if (timeValue.minutes()) throw "Invalid file time: Minutes should be 00 for 'hours' time specification";
            let hh = timeValue.hours();            
            if (hh % time.value) throw "Invalid file time: Hour should be a multiple of " + time.value; 
            return;
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }

    getPathForTime(dataSetCode, dataSet, timeValue) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return "";
        if (time.unit.toLowerCase().startsWith("hour")) {
            return timeValue.format("YYYY")  + "/" + timeValue.format("MM") + "/" + timeValue.format("DD"); 
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }

}

module.exports = TimeHelper.instance;