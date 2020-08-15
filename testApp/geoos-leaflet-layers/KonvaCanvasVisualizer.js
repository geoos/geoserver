class KonvaCanvasVisualizer extends KonvaLeafletVisualizer {
    constructor(options) {
        super(options);
    }

    onAttached() {
        this.canvas = document.createElement("canvas");
        this.canvas.id = "kcanvas"
        /*
        this.stageLayer.lPane.appendChild(this.canvas);
        this.canvas.style.position = "absolute";
        this.canvas.style.left = "0";
        this.canvas.style.top = "0";
        */
        this.positionCanvas();
    }

    positionCanvas() {
        this.canvas.style.width = this.width + "px";
        this.canvas.style.height = this.height + "px";
        let pxRatio = 1; //window.devicePixelRatio;
        this.canvas.width = this.width * pxRatio;
        this.canvas.height = this.height * pxRatio;
    }

    update() {
        this.konvaLayer.destroyChildren();
        this.positionCanvas();
        //this.canvas.style.display = "block";
        const image = new Konva.Image({image: this.canvas, x:0, y:0});
        this.konvaLayer.add(image);
        this.paintCanvas();
        this.konvaLayer.draw();
        //this.canvas.style.display = "none";
    }

    destroy() {
        //this.canvas.parentElement.removeChild(this.canvas);
        this.canvas = null;
        this.konvaLayer.destroyChildren();
        this.konvaLayer.draw();
    }
    paintCanvas() {}
}
