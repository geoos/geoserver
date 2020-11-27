const moment = require("moment-timezone");

class TimeHelper {
    static get instance() {
        if (TimeHelper.singleton) return TimeHelper.singleton;
        TimeHelper.singleton = new TimeHelper();
        return TimeHelper.singleton;
    }

    getTimeInFileName(dataSetCode, dataSet, fileName, fromPos) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return null;
        if (time.unit == "days" && time.value == 1) {
            let dt = fileName.substr(fromPos?fromPos:dataSetCode.length + 1);
            let fileTime = moment.tz(dt, "YYYY-MM-DD", "UTC");
            return fileTime
        } else if (time.unit.toLowerCase().startsWith("hour")) {
            // timeformat: UTC: YYYY-MM-DD_HH-mm
            let dt = fileName.substr(fromPos?fromPos:dataSetCode.length + 1);
            let fileTime = moment.tz(dt, "YYYY-MM-DD_HH-mm", "UTC");
            return fileTime
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }
    getTimeForFileName(dataSetCode, dataSet, timeValue) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return null;
        if (time.unit == "days" && time.value == 1) {
            // timeformat: UTC: YYYY-MM-DD
            return timeValue.format("YYYY-MM-DD");
        } else if (time.unit.toLowerCase().startsWith("hour")) {
            // timeformat: UTC: YYYY-MM-DD_HH-mm
            return timeValue.format("YYYY-MM-DD_HH-mm");
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }

    validateTimeForDataSet(dataSetCode, dataSet, timeValue) {
        let time = dataSet.config.temporality;
        if (!time) throw "No time config for dataSet " + dataSetCode;
        if (time == "none") return;
        if (time.unit == "days" && time.value == 1) {
            // timeformat: UTC: YYYY-MM-DD
            if (timeValue.minutes() || timeValue.hours() || timeValue.seconds()) throw "Invalid file time: Hours, Minutes adn Seconds should be 00";
            return;
        } else if (time.unit.toLowerCase().startsWith("hour")) {
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
        if (time.unit == "days" && time.value == 1) {
            return timeValue.format("YYYY")  + "/" + timeValue.format("MM"); 
        } else if (time.unit.toLowerCase().startsWith("hour")) {
            return timeValue.format("YYYY")  + "/" + timeValue.format("MM") + "/" + timeValue.format("DD"); 
        }
        throw "Unhandled time specification: " + JSON.stringify(time);
    }

    parseTime(t) {
        if (t == "now") return moment.tz("UTC");
        if (!isNaN(t)) {
            t = parseInt(t);
            if (t > 10000000) return moment.tz(t, "UTC");
            if (t >= 1970 && t <= 2500) return moment.tz("" + t, "YYYY", "UTC");
            return null;
        }
        if (t.length == 7) return moment.tz(t, "YYYY-MM", "UTC");
        if (t.length == 10) return moment.tz(t, "YYYY-MM-DD", "UTC");
        if (t.length == 13) return moment.tz(t, "YYYY-MM-DD HH", "UTC");
        if (t.length == 16) return moment.tz(t, "YYYY-MM-DD HH:mm", "UTC");
        if (t.length == 19) return moment.tz(t, "YYYY-MM-DD HH:mm:SS", "UTC");
        return null;
    }

    normalizeTime(dataSet, timeValue) {
        let time = dataSet.config.temporality;
        if (time.unit == "days" && time.value == 1) {
            let startOfPeriod = timeValue.clone().startOf("day");
            let middleOfPeriod = startOfPeriod.clone().add(12, "hours");
            switch(time.searchCriteria) {
                case "start":
                    return {time:startOfPeriod, searchDirection:timeValue.isBefore(middleOfPeriod)?-1:1}
                case "middle":
                    return {time:timeValue.isBefore(middleOfPeriod)?startOfPeriod:startOfPeriod.add(time.value, "hours"), searchDirection:timeValue.isBefore(middleOfPeriod)?1:-1}
                case "end":
                    return {time:startOfPeriod.add(time.value, "hours"), searchDirection:timeValue.isBefore(middleOfPeriod)?-1:1}
                default:
                    throw "Invalid searchCriteria: '" + time.searchCriteria + "'";
            }
        } else if (time.unit == "hours") {
            let startOfPeriod = timeValue.clone();
            let hh = parseInt(startOfPeriod.hours() / time.value) * time.value
            startOfPeriod.hours(hh);
            startOfPeriod = startOfPeriod.startOf("hour");
            let middleOfPeriod = startOfPeriod.clone().add(time.value / 2, "hours");
            switch(time.searchCriteria) {
                case "start":
                    return {time:startOfPeriod, searchDirection:timeValue.isBefore(middleOfPeriod)?-1:1}
                case "middle":
                    return {time:timeValue.isBefore(middleOfPeriod)?startOfPeriod:startOfPeriod.add(time.value, "hours"), searchDirection:timeValue.isBefore(middleOfPeriod)?1:-1}
                case "end":
                    return {time:startOfPeriod.add(time.value, "hours"), searchDirection:timeValue.isBefore(middleOfPeriod)?-1:1}
                d
                efault:
                    throw "Invalid searchCriteria: '" + time.searchCriteria + "'";
            }
        } else throw "Time unit '" + time.unit + "' not handled yet";
    }
    incTime(dataSet, timeValue, direction) {
        let time = dataSet.config.temporality;
        if (time.unit == "days" && time.value == 1) {
            return timeValue.add(direction, "days");
        } else if (time.unit == "hours") {
            return timeValue.add(direction * time.value, "hours");
        } else throw "Time unit '" + time.unit + "' not handled yet";
    }
    incTemporality(timeValue, temporality) {
        let t = timeValue.clone();
        switch (temporality) {
            case "5m":  return t.add(5, "minutes");
            case "15m": return t.add(15, "minutes");
            case "30m": return t.add(30, "minutes");
            case "1h": return t.add(1, "hours");
            case "6h": return t.add(6, "hours");
            case "12h": return t.add(12, "hours");
            case "1d": return t.add(1, "days");
            case "1M": return t.add(1, "month");
            case "3M": return t.add(3, "months");
            case "4M": return t.add(4, "months");
            case "6M": return t.add(6, "months");
            case "1y": return t.add(1, "year");            
        }
        console.error("temporality not handled", temporality);
        throw "Temporality " + temporality + " not handled in incTemporality";
    }
}

module.exports = TimeHelper.instance;