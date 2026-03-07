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

        /* ==========================================================
           COMBO SYSTEM
           Tracks consecutive line clears
           ========================================================== */

        this.combo = -1

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
        
        this.sounds = {
            rotate: new Audio("sounds/rotate.wav"),
            removelines: new Audio("sounds/removelines.mp3"),
            drop: new Audio("sounds/drop.wav"),
            gameover: new Audio("sounds/gameover.mp3"),
            hold: new Audio("sounds/hold.mp3"),
            levelup: new Audio("sounds/levelup.mp3"),
            tspin: new Audio("sounds/tspin.mp3")
        }

        this.soundEnabled = true
        this.gameOverSoundPlayed = false

        this.spawnAnim = 0
        this.score = 0

        /* =============================
           LINE CLEAR ANIMATION STATE 
           ============================= */
        
        this.clearingRows = []        // rows currently animating
        this.clearAnimationTime = 0   // animation timer
        this.clearDuration = 300      // milliseconds  
        this.particles = []           // particle explosion

        this.lines = 0
        this.level = 1
        this.levelFlash = 0
        this.dropInterval = 1000
        
        /* ==========================================================
           SOFT DROP STATE
           ========================================================== */

        this.softDropping = false
        this.softDropSpeed = 50 

        /* ==========================================================
           LOCK DELAY SYSTEM
           Prevents instant locking when piece touches floor
           ========================================================== */

        this.lockDelay = 500
        this.lockTimer = 0
        this.isGrounded = false

        /* ==========================================================
           GHOST PIECE FADE ANIMATION
           ========================================================== */

        this.ghostFade = 0
        this.ghostFadeDir = 1

        /* ==========================================================
          LEVEL SPEED TABLE
          ========================================================== */

        this.speedTable = [
            1000,850,720,630,550,
            470,380,300,220,150,
            120,100,80,70,60
        ]

        this.lastTime = 0
        this.dropCounter = 0
        this.moveIntervals = {}
        this.DAS = 1000  // delay before auto movement begins
        this.ARR = 1000    // repeat rate (higher = slower movement)
        this.keyTimers = {}
        this.renderY = 0         // Smooth piece falling
        this.bag = []
        this.holdPiece = null
        this.canHold = true

        this.active = null
 
        this.nextQueue = []
        this.fillNextQueue()

        this.initControls()
       
        this.dpadHardDrop = false    /*Toggle conroller Hard Drop  */

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
        /* Stores previous frame button states   */
        this.prevGamepadButtons = {} 
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

        this.spawnAnim = 1.4
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

        if(this.soundEnabled)
            this.sounds.rotate.play()
        
        this.lockTimer = 0

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

        this.lastMoveWasRotate = true       
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

    startMove(dir, DAS = this.DAS, ARR = this.ARR) {

        if (this.moveIntervals[dir]) return

        this.move(dir)

        const timeout = setTimeout(() => {

            this.moveIntervals[dir] = setInterval(() => {
                this.move(dir)
            }, ARR)

        }, DAS)

        this.moveIntervals[dir] = timeout
    }    

    move(dir) {

        this.active.pos.x += dir
        this.lastMoveWasRotate = false

        if (!this.valid(this.active.matrix, this.active.pos)) {
            this.active.pos.x -= dir
        }
        else {

            /* ==========================================================
            RESET LOCK TIMER WHEN PLAYER MOVES
            Prevents floating piece locks
            ========================================================== */

            this.lockTimer = 0
        }
    }

    /* ==========================================================
       SPIN DETECT LOGIC
       ========================================================== */

    detectTSpin() {

        if (this.active.type !== "T") return false
        if (!this.lastMoveWasRotate) return false

        let corners = 0

        const px = this.active.pos.x + 1
        const py = this.active.pos.y + 1

        const checks = [
            [px-1,py-1],
            [px+1,py-1],
            [px-1,py+1],
            [px+1,py+1]
        ]

        checks.forEach(([x,y])=>{
            if (
                x < 0 || x >= this.COLS ||
                y >= this.ROWS ||
                (y >= 0 && this.board[y][x] !== 0)
            ) corners++
        })

        if(this.soundEnabled)
            this.sounds.tspin.play()

        return corners >= 3
    }

    /* ==========================================================
       DROP LOGIC
       ========================================================== */

    /*  (WORKING DROP FUNCTION)  */
    drop() {

        this.active.pos.y++
        this.renderY = this.active.pos.y - 1

        if (!this.valid(this.active.matrix, this.active.pos)) {

            this.active.pos.y--

            /* Piece has touched the ground */
            this.isGrounded = true
        }
        else {

            /* Piece moved successfully */
            this.isGrounded = false
            this.lockTimer = 0
        }

        this.dropCounter = 0
    }

    /*  NOT WORKING REMOVE COMMENT BEFORE PROMPT
    drop() {

        this.active.pos.y++

        if (!this.valid(this.active.matrix, this.active.pos)) {

            this.active.pos.y--

            /* piece is now grounded */
    /*        if (!this.isGrounded) {
                this.isGrounded = true
                this.lockTimer = 0
            }

        } else {

            this.isGrounded = false
        }

        this.dropCounter = 0
    }                               */

    hardDrop() {

        if(this.soundEnabled)
            this.sounds.drop.play()

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

        if(this.soundEnabled)
            this.sounds.hold.play()


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

        if (rowsToClear.length === 0) {
            this.combo = -1
            return
        }

        rowsToClear.forEach(r=>this.spawnParticles(r))

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

        if(this.soundEnabled)
            this.sounds.removelines.play()

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

        /* ==========================================================
           LEVEL CLEAR ANIMATION
           ========================================================== */

        this.lines += linesCleared

        const newLevel = Math.floor(this.lines / 10) + 1

        if (newLevel > this.level) {

            this.level = newLevel
            this.levelFlash = 600

            if(this.soundEnabled)
                this.sounds.levelup.play()

            this.dropInterval =
                this.speedTable[Math.min(this.level-1, this.speedTable.length-1)]
        }

        /* ==========================================================
        SCORING SYSTEM
        Includes:
        - Standard line clears
        - Combo bonuses
        ========================================================== */

        const scoreTable = {1:100,2:300,3:500,4:800}
        
        /* Apply T-Spin Score  */
        const tspin = this.detectTSpin()

            if (tspin) {

                const tSpinScore = {
                    0:400,
                    1:800,
                    2:1200,
                    3:1600
                }

                baseScore = tSpinScore[linesCleared] * this.level
            }

        /* Increase combo counter */
        this.combo++

        /* Base score */
        let baseScore = scoreTable[linesCleared] * this.level

        /* Combo bonus */
        let comboBonus = this.combo > 0
            ? this.combo * 50 * this.level
            : 0

        this.score += baseScore + comboBonus

        this.scoreEl.innerText = this.score
        this.levelEl.innerText = this.level

        this.saveHighScore()   // check for new high score
    }

    /* ==========================================================
       PARTICLE EXPLOSION EFFECT
       ========================================================== */    

    spawnParticles(row) {

        for (let i=0;i<25;i++) {

            this.particles.push({

                x: Math.random()*this.canvas.width,
                y: row*this.BLOCK + this.BLOCK/2,

                vx: (Math.random()-0.5)*4,
                vy: (Math.random()-1)*4,

                life: 40
            })
        }
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
        this.ctx.globalAlpha = Math.max(0.2, 1 - this.spawnAnim)
        
        /* ---- FLASH CLEARING ROWS ---- */
        if (this.clearingRows.length > 0) {

            /* ==========================================================
               FADE OUT LINE CLEAR ANIMATION
               ========================================================== */

            const progress = this.clearAnimationTime / this.clearDuration

            this.clearingRows.forEach(row => {

                const shrink = 1 - progress

                this.ctx.fillStyle = "white"

                this.ctx.fillRect(
                    this.canvas.width * (progress / 2),
                    row * this.BLOCK,
                    this.canvas.width * shrink,
                    this.BLOCK
                )
            })
        }  
        
        /* ==========================================================
           PARTICLE EXPLOSION EFFECT
           ========================================================== */

        this.particles.forEach(p=>{

            this.ctx.fillStyle = "white"

            this.ctx.fillRect(
                p.x,
                p.y,
                3,
                3
            )
        })

        /* ==========================================================
           LEVEL UP FLASH EFFECT
           ========================================================== */

        if (this.levelFlash > 0) {

            this.ctx.fillStyle = "rgba(255,255,255,0.35)"
            this.ctx.fillRect(
                0,0,
                this.canvas.width,
                this.canvas.height
            )

            this.levelFlash -= 16
        }

        /*  GHOST FUNCTION  */
        const ghostY = this.getGhostPosition()

        this.ctx.globalAlpha = this.ghostFade
        this.drawMatrix(this.active.matrix,
            { x: this.active.pos.x, y: ghostY })
        this.ctx.globalAlpha = 1 

        if (this.active)
            this.drawMatrix(this.active.matrix, {
                x: this.active.pos.x,
                y: this.renderY
            }) 

        if (this.state === "gameover") {
            this.ctx.fillStyle = "rgba(0,0,0,0.7)"
            this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height)

            if(this.soundEnabled)
                this.sounds.gameover.play()

        /*      NOT WORKING REMOVE COMMENT BEFORE PROMPT 
            if (this.state === "gameover") {

                if (!this.gameOverSoundPlayed && this.soundEnabled) {

                    this.music.pause()

                    this.sounds.gameover.currentTime = 0
                    this.sounds.gameover.play()

                    this.gameOverSoundPlayed = true
                }
            }   */

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

            /* ==========================================================
            DROP SPEED LOGIC
            - Normal drop
            - Faster when soft drop active
            ========================================================== */

            const currentInterval = this.softDropping
                ? this.dropInterval / 8
                : this.dropInterval

            if (this.dropCounter > currentInterval)
                this.drop()
        }

        if (this.spawnAnim > 0) {
            this.spawnAnim -= delta * 0.002
        }

        /* ==========================================================
           GHOST FADE ANIMATION
           Creates a pulsing transparency effect
           ========================================================== */

        this.ghostFade += delta * 0.002 * this.ghostFadeDir

        if (this.ghostFade > 0.35) {
            this.ghostFade = 0.35
            this.ghostFadeDir = -1
        }

        if (this.ghostFade < 0.15) {
            this.ghostFade = 0.15
            this.ghostFadeDir = 1
        }

        /* ==========================================================
        LOCK DELAY HANDLING
        Allows player movement before piece locks
        ========================================================== */

        if (this.isGrounded && this.state === "running") {

            this.lockTimer += delta

            if (this.lockTimer >= this.lockDelay) {

                this.merge()
                this.clearLines()

                if (this.state !== "clearing")
                    this.spawn()

                this.lockTimer = 0
                this.isGrounded = false
            }
        }

        /* ---- UPDATE PARTICLE EXPLOSION ---- */

        this.particles.forEach(p=>{

            p.x += p.vx
            p.y += p.vy
            p.vy += 0.15
            p.life--
        })

        this.particles =
            this.particles.filter(p=>p.life>0)

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
 
        
        document.getElementById("mute-button").onclick = () => {

            this.soundEnabled = !this.soundEnabled

            document.getElementById("mute-button").innerText =
                this.soundEnabled ? "🔊" : "🔇"
        }

        /* ==========================================================
           UNIVERSAL INPUT BINDING
           Supports BOTH mouse and touch safely
           ========================================================== */

        function bindPress(element, press, release) {

            /* ---- Mouse ---- */

            element.addEventListener("mousedown", press)

            element.addEventListener("mouseup", release)

            element.addEventListener("mouseleave", release)

            /* ---- Touch ---- */

            element.addEventListener("touchstart", (e)=>{
                e.preventDefault()
                press(e)
            }, { passive:false })

            element.addEventListener("touchend", release)
        }

        const mLeft  = document.getElementById("m-left")
        const mRight = document.getElementById("m-right")
        const mDown  = document.getElementById("m-down")
        const mUp    = document.getElementById("m-up")

        /* ===============================
           D-PAD LEFT
           =============================== */

        bindPress(
            mLeft,

            () => {
                if (this.state === "running")
                    this.startMove(-1)
            },

            () => {
                clearTimeout(this.moveIntervals[-1])
                clearInterval(this.moveIntervals[-1])
                delete this.moveIntervals[-1]
            }
        )

        /* ===============================
           D-PAD RIGHT
           =============================== */

        bindPress(
            mRight,

            () => {
                if (this.state === "running")
                    this.startMove(1)
            },

            () => {
                clearTimeout(this.moveIntervals[1])
                clearInterval(this.moveIntervals[1])
                delete this.moveIntervals[1]
            }
        )

        /* ===============================
           D-PAD SOFT DROP
           =============================== */

        bindPress(
            mDown,

            () => { this.softDropping = true },

            () => { this.softDropping = false }
        )

        /* ===============================
           D-PAD ROTATE
           =============================== */

        bindPress(
            mUp,

            () => {
                if (this.state === "running")
                    this.rotate(1)
            },

            () => {}
        )

        /* ===============================
           D-PAD START/PAUSE
           =============================== */

        bindPress(
            document.getElementById("m-start"),
            ()=>this.togglePause(),
            ()=>{}
        )

        /* ===============================
           D-PAD HOLD
           =============================== */

        bindPress(
            document.getElementById("m-hold"),
            ()=>this.hold(),
            ()=>{}
        )

        /* ===============================
           D-PAD HARD DROP
           =============================== */
        
        bindPress(
            document.getElementById("m-drop"),
            ()=>this.hardDrop(),
            ()=>{}
        )

        makeDraggable(document.getElementById("mobile-controls"))

        function makeDraggable(el) {

            let offsetX = 0
            let offsetY = 0
            let dragging = false

            el.addEventListener("touchstart", e => {

                dragging = true
                const rect = el.getBoundingClientRect()

                offsetX = e.touches[0].clientX - rect.left
                offsetY = e.touches[0].clientY - rect.top
            })

            document.addEventListener("touchmove", e => {

                if (!dragging) return

                el.style.left = (e.touches[0].clientX - offsetX) + "px"
                el.style.top  = (e.touches[0].clientY - offsetY) + "px"
            })

            document.addEventListener("touchend", () => {
                dragging = false
            })
        }

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

        document.getElementById("hold-button")
            .onclick = () => this.hold()

        /* ==========================================================
        SOFT DROP BUTTON (ON SCREEN CONTROLS)
        Works the same as holding ArrowDown
        ========================================================== */

        const downBtn = document.getElementById("down-button")

        downBtn.addEventListener("mousedown", () => {
            this.softDropping = true
        })

        downBtn.addEventListener("mouseup", () => {
            this.softDropping = false
        })

        downBtn.addEventListener("mouseleave", () => {
            this.softDropping = false
        })

        downBtn.addEventListener("touchstart", (e) => {
            e.preventDefault()
            this.softDropping = true
        })

        downBtn.addEventListener("touchend", () => {
            this.softDropping = false
        })      

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

            if (e.key === "ArrowDown")
                this.softDropping = false
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
                this.softDropping = true

            if (e.key === "ArrowUp")
                this.rotate(1)

            if (e.code === "Space")
                this.hardDrop()

            if (e.key === "Shift")
                this.hold()
        })
    }

    
    /* ==========================================================
       GAMEPAD INPUT SYSTEM WITH EDGE DETECTION
       - Prevents 60fps button spam
       - Supports (Xbox / PS / Generic)
       - Left Stick = Move
       - D-Pad = Move
       - A / Cross = Rotate
       - B / Circle = Hard Drop
       - Y / Triangle = Hold
       - Start = Pause
       ========================================================== */

    pollGamepad() {

        const gamepads = navigator.getGamepads()
        if (!gamepads) return

        if (this.gamepadIndex === null) return  

        const gp = navigator.getGamepads()[this.gamepadIndex]
        if (!gp) return

        const deadZone = 0.35

        /* ==============================
        ANALOG STICK MOVEMENT
        ============================== */

        if (gp.axes[0] < -deadZone) {
            this.startMove(-1)
        } 
        else if (this.moveIntervals[-1]) {

            clearTimeout(this.moveIntervals[-1])
            clearInterval(this.moveIntervals[-1])
            delete this.moveIntervals[-1]
        }

        if (gp.axes[0] > deadZone) {
            this.startMove(1)
        } 
        else if (this.moveIntervals[1]) {

            clearTimeout(this.moveIntervals[1])
            clearInterval(this.moveIntervals[1])
            delete this.moveIntervals[1]
        }

        /* ==========================================================
           CONTROLLER MOVEMENT SPEED CONTROL
           ========================================================== */

        const controllerARR = 1000     // repeat rate (higher = slower movement)
        const controllerDAS = 1000      // delay before auto movement begins

        if (gp.axes[0] < -deadZone) {
            this.startMove(-1, controllerDAS, controllerARR)
        }

        /* ==============================
        D-PAD MOVEMENT
        ============================== */

        if (gp.buttons[14].pressed) this.startMove(-1)
        if (gp.buttons[15].pressed) this.startMove(1)

        /* ==========================================================
        STOP CONTROLLER MOVEMENT CLEANLY
        - Clears timers
        - Removes interval entry so movement can start again
        ========================================================== */

        if (!gp.buttons[14].pressed && this.moveIntervals[-1]) {

            clearTimeout(this.moveIntervals[-1])
            clearInterval(this.moveIntervals[-1])

            delete this.moveIntervals[-1]
        }

        if (!gp.buttons[15].pressed && this.moveIntervals[1]) {

            clearTimeout(this.moveIntervals[1])
            clearInterval(this.moveIntervals[1])

            delete this.moveIntervals[1]
        }

        /* ==========================================================
        CONTROLLER SOFT DROP
        D-Pad Down = button 13
        Active ONLY while held
        ========================================================== */

        this.softDropping = gp.buttons[13].pressed

        /* ==============================
        EDGE DETECTION
        (prevents spam)
        ============================== */

        gp.buttons.forEach((btn, index) => {

        const wasPressed = this.prevGamepadButtons[index] || false

            /* Trigger ONLY when button becomes pressed */
            if (btn.pressed && !wasPressed) {

                switch(index) {
                    
                    case 12:
                        if (this.dpadHardDrop)
                            this.hardDrop()
                        else
                            this.rotate(1)
                        break

                    case 0: // A / Cross
                        this.rotate(1)
                        break

                    case 1: // B / Circle
                        this.hardDrop()
                        break

                    case 3: // Y / Triangle
                        this.hold()
                        break

                    /* ==========================================================
                    CONTROLLER START BUTTON
                    - Starts new game when game over
                    - Pauses/unpauses otherwise
                    ========================================================== */

                    case 9:

                        if (this.state === "gameover") {

                            this.reset()
                            return
                        }

                        this.togglePause()
                        break
                }
            }

            this.prevGamepadButtons[index] = btn.pressed
        })
    }
}

document.addEventListener("DOMContentLoaded",
    () => new Tetris())