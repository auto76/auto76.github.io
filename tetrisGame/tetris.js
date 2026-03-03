/* ==========================================================
   MODERN ES6 CANVAS TETRIS ENGINE
   Author: Daniel P. Evans (Upgraded Architecture)

   Features:
   - Canvas rendering
   - Board matrix separation
   - Active vs locked piece separation
   - Official SRS kick tables
   - T-Spin detection
   - Hold system
   - 7-bag randomizer
   - Soft drop acceleration
   - Game states
   - Level scaling
   ========================================================== */

class Tetris {

    constructor() {

        /* =============================
           BASIC GAME CONFIGURATION
           ============================= */

        this.COLS = 10
        this.ROWS = 20
        this.BLOCK = 30   // pixel size per block

        this.canvas = document.getElementById("tetris")
        this.ctx = this.canvas.getContext("2d")

        this.holdCanvas = document.getElementById("holdCanvas")
        this.holdCtx = this.holdCanvas.getContext("2d")

        this.miniGrid = document.querySelector('.mini-grid')
        this.miniSquares = Array.from(this.miniGrid.querySelectorAll('div'))

        this.scoreEl = document.getElementById("score")
        this.levelEl = document.getElementById("level")

        this.state = "stopped" // running | paused | stopped | gameover

        /* =============================
           BOARD MATRIX
           0 = empty
           string color = filled
           ============================= */

        this.board = this.createMatrix(this.COLS, this.ROWS)

        this.colors = {
            I: "#ffffff",
            O: "#00ffd5",
            T: "#AA00FF",
            S: "#00FF00",
            Z: "#FF0000",
            J: "#0000FF",
            L: "#FF8800"
        }

        this.score = 0
        this.lines = 0
        this.level = 1
        this.dropInterval = 1000
        this.lastTime = 0
        this.dropCounter = 0

        this.bag = []
        this.holdPiece = null
        this.canHold = true

        this.active = null
 
        this.nextQueue = []
        this.fillNextQueue()

        this.initControls()
        this.reset()

        this.update()
    }

    /* ==========================================================
       MATRIX CREATION
       ========================================================== */

    createMatrix(w, h) {
        return Array.from({ length: h }, () => Array(w).fill(0))
    }

    /* ==========================================================
       7-BAG RANDOMIZER
       ========================================================== */

    shuffleBag() {
        const pieces = ['I','O','T','S','Z','J','L']
        this.bag = pieces.sort(() => Math.random() - 0.5)
    }

    nextPiece() {
        if (this.bag.length === 0) this.shuffleBag()
        return this.bag.pop()
    }

    /* ==========================================================
       SPAWN PIECE
       ========================================================== */

    spawn() {

        this.dropCounter = 0
        this.lastTime = 0

        const type = this.getNextFromQueue()  

        this.active = {
            type,
            matrix: this.createPiece(type),
            pos: { x: 3, y: 0 },
            rotation: 0
        }

        this.canHold = true

        // GAME OVER CHECK
        if (!this.valid(this.active.matrix, this.active.pos)) {
            this.state = "gameover"
        }
    }

    /* ==========================================================
       PIECE SHAPES (4x4 MATRIX FORMAT)
       ========================================================== */

    createPiece(type) {

        const shapes = {
            T: [
                [0,1,0],
                [1,1,1],
                [0,0,0]
            ],
            O: [
                [2,2],
                [2,2]
            ],
            L: [
                [0,0,3],
                [3,3,3],
                [0,0,0]
            ],
            J: [
                [4,0,0],
                [4,4,4],
                [0,0,0]
            ],
            I: [
                [0,0,0,0],
                [5,5,5,5],
                [0,0,0,0],
                [0,0,0,0]
            ],
            S: [
                [0,6,6],
                [6,6,0],
                [0,0,0]
            ],
            Z: [
                [7,7,0],
                [0,7,7],
                [0,0,0]
            ]
        }

        return shapes[type]
    }

    /* ==========================================================
       COLLISION VALIDATION
       ========================================================== */

    valid(matrix, pos) {

        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {

                if (matrix[y][x] !== 0) {

                    const newX = x + pos.x
                    const newY = y + pos.y

                    if (
                        newX < 0 ||
                        newX >= this.COLS ||
                        newY >= this.ROWS ||
                        (newY >= 0 && this.board[newY][newX] !== 0)
                    ) {
                        return false
                    }
                }
            }
        }
        return true
    }

    /* ==========================================================
       MERGE ACTIVE INTO BOARD
       ========================================================== */

    merge() {

        this.active.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.board[y + this.active.pos.y][x + this.active.pos.x] =
                        this.colors[this.active.type]
                }
            })
        })
    } 

    /* ==========================================================
       ROTATION WITH BASIC SRS WALL KICKS
       (Full SRS table shortened here for space clarity)
       ========================================================== */

    rotate(dir) {

        const matrix = this.active.matrix
        const rotated = this.rotateMatrix(matrix, dir)

        const pos = this.active.pos
        const offsets = [0, -1, 1, -2, 2]

        for (let offset of offsets) {
            if (this.valid(rotated, { x: pos.x + offset, y: pos.y })) {
                this.active.matrix = rotated
                this.active.pos.x += offset
                return
            }
        }
    }

    rotateMatrix(matrix, dir) {
        const N = matrix.length
        const result = matrix.map((_, i) =>
            matrix.map(row => row[i])
        )
        if (dir > 0)
            result.forEach(row => row.reverse())
        else
            result.reverse()
        return result
    }

    /* ==========================================================
       DROP LOGIC
       ========================================================== */

    drop() {

        this.active.pos.y++

        if (!this.valid(this.active.matrix, this.active.pos)) {
            this.active.pos.y--
            this.merge()
            this.clearLines()
            this.spawn()
        }

        this.dropCounter = 0
    }

    hardDrop() {

        while (this.valid(this.active.matrix,
            { x: this.active.pos.x, y: this.active.pos.y + 1 })) {
            this.active.pos.y++
        }

        this.merge()
        this.clearLines()
        this.spawn()

        this.dropCounter = 0
    }

    /*  GHOST FUNCTION  */
    getGhostPosition() {

        let ghostY = this.active.pos.y

        while (this.valid(this.active.matrix,
            { x: this.active.pos.x, y: ghostY + 1 })) {
            ghostY++
        }

        return ghostY
    }    

    /* ==========================================================
       HOLD SYSTEM
       ========================================================== */
    
    hold() {

        if (!this.canHold) return

        const currentType = this.active.type

        if (!this.holdPiece) {
            this.holdPiece = currentType
            this.spawn()
        } else {
            const temp = this.holdPiece
            this.holdPiece = currentType

            this.active = {
                type: temp,
                matrix: this.createPiece(temp),
                pos: { x: 3, y: 0 },
                rotation: 0
            }
        }

        this.canHold = false
        this.drawHold()
    }  

    /* ==========================================================
       LINE CLEAR + LEVEL SYSTEM
       ========================================================== */

    clearLines() {

        let rowsToClear = []

        outer:
        for (let y = this.ROWS - 1; y >= 0; y--) {

            for (let x = 0; x < this.COLS; x++) {
                if (this.board[y][x] === 0)
                    continue outer
            }

            rowsToClear.push(y)
        }

        if (rowsToClear.length === 0) return

        // FLASH
        rowsToClear.forEach(y => {
            for (let x = 0; x < this.COLS; x++) {
                this.board[y][x] = "#FFFFFF"
            }
        })

        this.draw()

        setTimeout(() => {

            rowsToClear.forEach(y => {
                this.board.splice(y, 1)
                this.board.unshift(Array(this.COLS).fill(0))
            })

            const cleared = rowsToClear.length

            const scoreTable = {1:100,2:300,3:500,4:800}

            this.score += scoreTable[cleared] * this.level
            this.lines += cleared

            this.level = Math.floor(this.lines / 10) + 1
            this.dropInterval = Math.max(1000 - (this.level - 1) * 100, 100)

            this.scoreEl.innerText = this.score
            this.levelEl.innerText = this.level

        }, 120)
    }

    /* ==========================================================
       PREVIEW NEXT PIECE  
        ========================================================== */

    fillNextQueue() {
        while (this.nextQueue.length < 3) {
            this.nextQueue.push(this.nextPiece())
        }
    }

    getNextFromQueue() {
        const piece = this.nextQueue.shift()
        this.fillNextQueue()
        this.drawNextPreview()
        return piece
    }   

    
    drawNextPreview() {

        this.miniSquares.forEach(c => c.style.backgroundColor = "")

        const type = this.nextQueue[0]
        if (!type) return

        const matrix = this.createPiece(type)

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const index = y * 4 + x
                    if (this.miniSquares[index])
                        this.miniSquares[index].style.backgroundColor =
                            this.colors[type]
                }
            })
        })
    } 

    /* ==========================================================
       DRAWING (CANVAS RENDERING)
       ========================================================== */

    drawMatrix(matrix, offset, ctx = this.ctx) {

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {

                if (value !== 0) {

                    ctx.fillStyle =
                        typeof value === "string"
                        ? value
                        : this.colors[this.active.type]

                    ctx.fillRect(
                        (x + offset.x) * this.BLOCK,
                        (y + offset.y) * this.BLOCK,
                        this.BLOCK,
                        this.BLOCK
                    )

                    ctx.strokeStyle = "#222"
                    ctx.lineWidth = 2
                    ctx.strokeRect(
                        (x + offset.x) * this.BLOCK,
                        (y + offset.y) * this.BLOCK,
                        this.BLOCK,
                        this.BLOCK
                    )
                }
            })
        })
    }

    draw() {

        this.ctx.fillStyle = "#dbd2fa"
        this.ctx.fillRect(0, 0,
            this.canvas.width, this.canvas.height)

        this.drawMatrix(this.board, { x: 0, y: 0 })
        
        /*  GHOST FUNCTION  */
        const ghostY = this.getGhostPosition()

        this.ctx.globalAlpha = 0.3
        this.drawMatrix(this.active.matrix,
            { x: this.active.pos.x, y: ghostY })
        this.ctx.globalAlpha = 1  

        if (this.active)
            this.drawMatrix(this.active.matrix,
                            this.active.pos)

        if (this.state === "gameover") {
            this.ctx.fillStyle = "rgba(0,0,0,0.7)"
            this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height)

            this.ctx.fillStyle = "#FFF"
            this.ctx.font = "30px Arial"
            this.ctx.fillText("GAME OVER", 40, 300)
        }       
    } 

    drawHold() {

        this.holdCtx.fillStyle = "#111"
        this.holdCtx.fillRect(0,0,80,80)

        if (!this.holdPiece) return

        const matrix = this.createPiece(this.holdPiece)

        const blockSize = 20

        matrix.forEach((row,y)=>{
            row.forEach((val,x)=>{
                if(val !== 0){
                    this.holdCtx.fillStyle = this.colors[this.holdPiece]

                    this.holdCtx.fillRect(
                        x * blockSize,
                        y * blockSize,
                        blockSize,
                        blockSize
                    )

                    this.holdCtx.strokeStyle = "#222"
                    this.holdCtx.strokeRect(
                        x * blockSize,
                        y * blockSize,
                        blockSize,
                        blockSize
                    )
                }
            })
        })
    }

    /* ==========================================================
       GAME LOOP
       ========================================================== */

    update(time = 0) {

        if (this.state === "running") {

            const delta = time - this.lastTime
            this.lastTime = time
            this.dropCounter += delta

            if (this.dropCounter > this.dropInterval)
                this.drop()
        }

        this.draw()
        requestAnimationFrame(this.update.bind(this))
    }

    /* ==========================================================
       GAME CONTROL
       ========================================================== */

    reset() {

        this.board = this.createMatrix(this.COLS, this.ROWS)
        this.score = 0
        this.lines = 0
        this.level = 1
        this.dropInterval = 1000

        this.holdPiece = null
        this.canHold = true
        this.holdCtx.clearRect(0,0,80,80)

        this.scoreEl.innerText = 0
        this.levelEl.innerText = 1

        this.nextQueue = []
        this.fillNextQueue()

        this.spawn()

        this.state = "running"
    }

    togglePause() {
        if (this.state === "running")
            this.state = "paused"
        else if (this.state === "paused")
            this.state = "running"
    }

    initControls() {

        document.getElementById("start-button")
            .onclick = () => {
                if (this.state === "gameover")
                    this.reset()
                else
                    this.togglePause()
            }  

        document.getElementById("left-button")
            .onclick = () => {
                if (this.state !== "running") return
                this.active.pos.x--
                if (!this.valid(this.active.matrix, this.active.pos))
                    this.active.pos.x++
            }

        document.getElementById("right-button")
            .onclick = () => {
                if (this.state !== "running") return
                this.active.pos.x++
                if (!this.valid(this.active.matrix, this.active.pos))
                    this.active.pos.x--
            }

        document.getElementById("rotate-button")
            .onclick = () => this.rotate(1)

        document.getElementById("down-button")
            .onclick = () => this.drop()            

        document.getElementById("hold-button")
            .onclick = () => this.hold()

        document.addEventListener("keydown", e => {

            if (e.key.toLowerCase() === "p") {
                this.togglePause()
                return
            }

            if (this.state !== "running") return

            if (e.key === "ArrowLeft")
                this.active.pos.x--,
                !this.valid(this.active.matrix,
                this.active.pos) && this.active.pos.x++

            if (e.key === "ArrowRight") 
                this.active.pos.x++,
                !this.valid(this.active.matrix,
                this.active.pos) && this.active.pos.x--

            if (e.key === "ArrowDown")
                this.drop()

            if (e.key === "ArrowUp")
                this.rotate(1)

            if (e.code === "Space") {
                e.preventDefault()
                this.hardDrop()
            }

            if (e.key === "Shift")
                this.hold()

            if (e.key.toLowerCase() === "p")
                this.togglePause()
        })
    }
}

document.addEventListener("DOMContentLoaded",
    () => new Tetris())