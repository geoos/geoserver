class Time extends ZCustomController {
    refresh(dataSet) {
        this.time = moment.tz("UTC");
        this.dataSet = dataSet
        let temporality = dataSet.temporality;
        if (!temporality || temporality == "none") {
            this.hide()
            return;
        }
        if (temporality.unit = "hours") {
            this.time = this.time.startOf("hour");
        } else throw "Temporality unit '" + temporality.unit + "' not handled yet"
        this.showTime();
    }

    showTime() {
        this.edYear.value = this.time.format("YYYY");
        this.edMonth.value = this.time.format("MMMM");
        this.edDay.value = this.time.format("DD");
        this.edHour.value = this.time.format("HH:mm");
    }

    get value() {return this.time}
    set value(t) {this.time = t; this.showTime()}

    triggerChange() {
        this.showTime();
        this.triggerEvent("change", this.time);
    }
    onCmdPrevYear_click() {this.time.year(this.time.year() - 1); this.triggerChange()}
    onCmdNextYear_click() {this.time.year(this.time.year() + 1); this.triggerChange()}
    onCmdPrevMonth_click() {this.time.month(this.time.month() - 1); this.triggerChange()}
    onCmdNextMonth_click() {this.time.month(this.time.month() + 1); this.triggerChange()}
    onCmdPrevDay_click() {this.time.date(this.time.date() - 1); this.triggerChange()}
    onCmdNextDay_click() {this.time.date(this.time.date() + 1); this.triggerChange()}
    onCmdPrevHour_click() {this.time.hours(this.time.hours() - 1); this.triggerChange()}
    onCmdNextHour_click() {this.time.hours(this.time.hours() + 1); this.triggerChange()}
}
ZVC.export(Time)