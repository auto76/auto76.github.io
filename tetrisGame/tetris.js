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

        /* =============================
           LOCAL HIGH SCORE SYSTEM
           ============================= */

        this.highScoreEl = document.getElementById("highScore")
        this.highScore = this.loadHighScore()
        this.highScoreEl.innerText = this.highScore

        this.state = "stopped" // running | paused | stopped | gameover

        /* =============================
           BOARD MATRIX
           0 = empty
           string color = filled
           ============================= */

        this.board = this.createMatrix(this.COLS, this.ROWS)

        this.resizeCanvas()
        window.addEventListener("resize",
            () => this.resizeCanvas())

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
             
        /* =============================
           LINE CLEAR ANIMATION STATE (not working)
           ============================= */
        
        this.clearingRows = []        // rows currently animating
        this.clearAnimationTime = 0   // animation timer
        this.clearDuration = 300      // milliseconds  
        

        this.lines = 0
        this.level = 1
        this.dropInterval = 1000
        this.lastTime = 0
        this.dropCounter = 0
        this.moveIntervals = {}

        this.DAS = 150
        this.ARR = 30
        this.keyTimers = {}

        this.bag = []
        this.holdPiece = null
        this.canHold = true

        this.active = null
 
        this.nextQueue = []
        this.fillNextQueue()

        this.initControls()
        this.reset()

        this.update()

        /* =============================
           GAMEPAD SUPPORT INIT
           ============================= */
        this.gamepadIndex = null
        this.gamepadButtons = {}
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected")
            this.gamepadIndex = e.gamepad.index
        })
    }

    /* ==========================================================
       MATRIX CREATION
       ========================================================== */

    createMatrix(w, h) {
        return Array.from({ length: h }, () => Array(w).fill(0))
    }

    /* ==========================================================
       TRUE RESPONSIVE CANVAS SCALING
       - Fits BOTH width and height
       - No cropping
       ========================================================== */

    resizeCanvas() {

        const maxWidth = window.innerWidth * 0.55
        const maxHeight = window.innerHeight * 0.65

        const blockFromWidth = Math.floor(maxWidth / this.COLS)
        const blockFromHeight = Math.floor(maxHeight / this.ROWS)

        this.BLOCK = Math.max(18,
            Math.min(blockFromWidth, blockFromHeight)
        )

        this.canvas.width = this.COLS * this.BLOCK
        this.canvas.height = this.ROWS * this.BLOCK
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
       ROTATION WITH TRUE SRS KICK TABLES
       ========================================================== */

    rotate(dir) {

        const type = this.active.type
        const oldRotation = this.active.rotation
        const newRotation =
            (oldRotation + (dir > 0 ? 1 : 3)) % 4

        const rotated =
            this.rotateMatrix(this.active.matrix, dir)

        const kicks = this.getKickData(
            type, oldRotation, newRotation)

        for (let [x,y] of kicks) {
            if (this.valid(rotated, {
                x:this.active.pos.x + x,
                y:this.active.pos.y - y
            })) {
                this.active.matrix = rotated
                this.active.pos.x += x
                this.active.pos.y -= y
                this.active.rotation = newRotation
                return
            }
        }
    }

    getKickData(type, from, to) {

        const JLSTZ = {
            "0>1":[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
            "1>0":[[0,0],[1,0],[1,-1],[0,2],[1,2]],
            "1>2":[[0,0],[1,0],[1,-1],[0,2],[1,2]],
            "2>1":[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
            "2>3":[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
            "3>2":[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
            "3>0":[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
            "0>3":[[0,0],[1,0],[1,1],[0,-2],[1,-2]]
        }

        const I = {
            "0>1":[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
            "1>0":[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
            "1>2":[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
            "2>1":[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
            "2>3":[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
            "3>2":[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
            "3>0":[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
            "0>3":[[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
        }

        const key = `${from}>${to}`

        if (type === "I") return I[key]
        if (type === "O") return [[0,0]]
        return JLSTZ[key]
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
       DAS / ARR MOVEMENT SYSTEM
       ========================================================== */

    startMove(dir) {

        if (this.moveIntervals[dir]) return

        // Initial move instantly
        this.move(dir)

        // DAS delay
        const timeout = setTimeout(() => {

            this.moveIntervals[dir] = setInterval(() => {
                this.move(dir)
            }, this.ARR)

        }, this.DAS)

        this.moveIntervals[dir] = timeout
    }

    move(dir) {

        this.active.pos.x += dir

        if (!this.valid(this.active.matrix, this.active.pos)) {
            this.active.pos.x -= dir
        }
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

            /* If no animation triggered, spawn immediately */
            if (this.state !== "clearing") {
                this.spawn()
            }
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

        if (this.state !== "clearing") {
            this.spawn()
        }

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
       LINE CLEAR WITH FLASH ANIMATION 
       - Detect full rows
       - Animate before removing
       - Prevent board corruption
       ========================================================== */

    clearLines() {

        const rowsToClear = []

        // Detect full rows
        for (let y = 0; y < this.ROWS; y++) {
            if (this.board[y].every(cell => cell !== 0)) {
                rowsToClear.push(y)
            }
        }

        if (rowsToClear.length === 0) return

        /* ---- Trigger animation instead of immediate removal ---- */

        this.clearingRows = rowsToClear
        this.clearAnimationTime = 0

        // Pause piece spawning until animation finishes
        this.state = "clearing"
    }
        
    /* ==========================================================
       FINALIZE LINE CLEAR AFTER ANIMATION
       ========================================================== */

    finishLineClear() {

        let newBoard = []
        let linesCleared = this.clearingRows.length

        // Rebuild board without cleared rows
        for (let y = 0; y < this.ROWS; y++) {
            if (!this.clearingRows.includes(y)) {
                newBoard.push(this.board[y])
            }
        }

        while (newBoard.length < this.ROWS) {
            newBoard.unshift(Array(this.COLS).fill(0))
        }

        this.board = newBoard
        this.clearingRows = []

        /* ---- SCORING ---- */
        const scoreTable = {1:100,2:300,3:500,4:800}

        this.score += scoreTable[linesCleared] * this.level
        this.lines += linesCleared

        this.level = Math.floor(this.lines / 10) + 1
        this.dropInterval = Math.max(1000 - (this.level - 1) * 75, 80)

        this.scoreEl.innerText = this.score
        this.levelEl.innerText = this.level

        this.saveHighScore()   // check for new high score
    }

    /* ==========================================================
       LOAD HIGH SCORE FROM BROWSER STORAGE
       ========================================================== */
    loadHighScore() {

        const saved = localStorage.getItem("tetrisHighScore")

        return saved ? parseInt(saved) : 0
    }

    /* ==========================================================
       SAVE HIGH SCORE IF CURRENT SCORE EXCEEDS IT
       ========================================================== */
    saveHighScore() {

        if (this.score > this.highScore) {

            this.highScore = this.score
            localStorage.setItem("tetrisHighScore", this.highScore)

            this.highScoreEl.innerText = this.highScore
        }
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

    /* ==========================================================
       NEXT PIECE PREVIEW (FULL CLEAR EACH FRAME)
       ========================================================== */

    drawNextPreview() {

        // FULL reset of all mini squares
        this.miniSquares.forEach(square => {
            square.style.backgroundColor = "transparent"
            square.style.border = "none"
        })

        const type = this.nextQueue[0]
        if (!type) return

        const matrix = this.createPiece(type)

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {

                if (value !== 0) {

                    const index = y * 4 + x

                    if (this.miniSquares[index]) {

                        this.miniSquares[index].style.backgroundColor =
                            this.colors[type]

                        this.miniSquares[index].style.border =
                            "1px solid #222"
                    }
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
        
        /* ---- FLASH CLEARING ROWS ---- */
        if (this.clearingRows.length > 0) {

            this.ctx.fillStyle = "white"

            this.clearingRows.forEach(row => {

                this.ctx.fillRect(
                    0,
                    row * this.BLOCK,
                    this.canvas.width,
                    this.BLOCK
                )
            })
        }  
        
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

            if (this.state === "gameover" && !this.highScoreSaved) {
                this.saveHighScore()
                this.highScoreSaved = true
            }

            this.ctx.fillStyle = "#FFF"
            this.ctx.font = "30px Arial"
            this.ctx.fillText("GAME OVER", 40, 300)
        }   
    } 

    drawHold() {

        this.holdCtx.fillStyle = "#ffff00"
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
       GAME LOOP (PROPER TIME HANDLING)
       - Single delta calculation
       - Drop + animation separated
       - No freeze
       ========================================================== */

    update(time = 0) {

        /* ---- Calculate frame delta ONCE ---- */
        const delta = time - this.lastTime
        this.lastTime = time

        /* ---- RUNNING STATE ---- */
        if (this.state === "running") {

            this.dropCounter += delta

            if (this.dropCounter > this.dropInterval) {
                this.drop()
            }
        }

        /* ---- CLEARING ANIMATION STATE ---- */
        if (this.state === "clearing") {

            this.clearAnimationTime += delta

            if (this.clearAnimationTime >= this.clearDuration) {

                this.finishLineClear()
                this.spawn()            // IMPORTANT: spawn AFTER clear
                this.state = "running"
            }
        }

        this.pollGamepad()
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
        this.highScoreSaved = false

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

        /* (REMOVE COMMENT IF RESET BUTTON IS NEEDED) 
        document.getElementById("resetHighScore")
            .onclick = () => {

                localStorage.removeItem("tetrisHighScore")

                this.highScore = 0
                this.highScoreEl.innerText = 0
            }
        */

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

        document.addEventListener("keyup", e => {

            if (e.key === "ArrowLeft") {
                clearTimeout(this.moveIntervals[-1])
                clearInterval(this.moveIntervals[-1])
                delete this.moveIntervals[-1]
            }

            if (e.key === "ArrowRight") {
                clearTimeout(this.moveIntervals[1])
                clearInterval(this.moveIntervals[1])
                delete this.moveIntervals[1]
            }
        })

        document.addEventListener("keydown", e => {

            const keys = ["ArrowLeft","ArrowRight","ArrowDown","ArrowUp","Space"]

            if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.key)) {
                e.preventDefault()
            }

            if (keys.includes(e.key) || e.code === "Space") {
                e.preventDefault()
            }

            if (e.key.toLowerCase() === "p") {
                this.togglePause()
                return
            }

            if (this.state !== "running") return

            if (e.key === "ArrowLeft")
                this.startMove(-1)

            if (e.key === "ArrowRight")
                this.startMove(1)

            if (e.key === "ArrowDown")
                this.drop()

            if (e.key === "ArrowUp")
                this.rotate(1)

            if (e.code === "Space")
                this.hardDrop()

            if (e.key === "Shift")
                this.hold()
        })
    }

    /* ==========================================================
    FULL GAMEPAD SUPPORT (Xbox / PS / Generic)
    - Left Stick = Move
    - D-Pad = Move
    - A / Cross = Rotate
    - B / Circle = Hard Drop
    - Y / Triangle = Hold
    - Start = Pause
    ========================================================== */

    pollGamepad() {

        if (this.gamepadIndex === null) return

        const gamepad = navigator.getGamepads()[this.gamepadIndex]
        if (!gamepad) return

        const deadZone = 0.4

        /* ---- LEFT / RIGHT ---- */
        if (gamepad.axes[0] < -deadZone) this.startMove(-1)
        if (gamepad.axes[0] > deadZone) this.startMove(1)

        /* ---- D-PAD ---- */
        if (gamepad.buttons[14].pressed) this.startMove(-1)
        if (gamepad.buttons[15].pressed) this.startMove(1)

        /* ---- SOFT DROP ---- */
        if (gamepad.buttons[13].pressed) this.drop()

        /* ---- ROTATE ---- */
        if (gamepad.buttons[0].pressed) this.rotate(1)

        /* ---- HARD DROP ---- */
        if (gamepad.buttons[1].pressed) this.hardDrop()

        /* ---- HOLD ---- */
        if (gamepad.buttons[3].pressed) this.hold()

        /* ---- PAUSE ---- */
        if (gamepad.buttons[9].pressed) this.togglePause()
    }
}

document.addEventListener("DOMContentLoaded",
    () => new Tetris())

/* ==========================================================
   MOBILE D-PAD DRAG WITH BOUNDS + EDGE SNAP
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const dpad = document.getElementById("mobile-controls")
    if (!dpad) return

    let isDragging = false
    let offsetX = 0
    let offsetY = 0

    dpad.addEventListener("touchstart", (e) => {

        isDragging = true

        offsetX = e.touches[0].clientX - dpad.offsetLeft
        offsetY = e.touches[0].clientY - dpad.offsetTop
    })

    dpad.addEventListener("touchmove", (e) => {

        if (!isDragging) return

        let newX = e.touches[0].clientX - offsetX
        let newY = e.touches[0].clientY - offsetY

        /* ---- Bounds Clamp ---- */
        newX = Math.max(0, Math.min(window.innerWidth - dpad.offsetWidth, newX))
        newY = Math.max(0, Math.min(window.innerHeight - dpad.offsetHeight, newY))

        dpad.style.left = newX + "px"
        dpad.style.top = newY + "px"
    })

    dpad.addEventListener("touchend", () => {

        isDragging = false

        /* ---- SNAP TO NEAREST SIDE ---- */
        const midpoint = window.innerWidth / 2

        if (dpad.offsetLeft < midpoint) {
            dpad.style.left = "20px"
        } else {
            dpad.style.left =
                (window.innerWidth - dpad.offsetWidth - 20) + "px"
        }
    })
})