// Canvas engine parameters setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 1000;
canvas.height = 700;

let bgMusic = null;
let isMuted = false;
let currentDifficulty = "easy";
let gameState = "start";

let score = 0;
let combo = 0;
let maxCombo = 0;
let missed = 0;
const maxMissed = 10;
const winScore = 25000;

let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;
let lastMouseX = mouseX;
let lastMouseY = mouseY;
let mouseVelocity = 0;

let saberTrail = [];
const trailLength = 16; 

let blocks = [];
let blockSpawnTimer = 0;
let blockSpawnInterval = 75;
let baseSpawnInterval = 75;
let minSpawnInterval = 35;
let blocksSliced = 0;
let particles = [];

const vanishingPointX = canvas.width / 2;
const vanishingPointY = canvas.height / 2;

// Flow zone operational space metrics
let flowZoneActive = false;
let flowZoneEndTime = 0;

class Block {
    constructor() {
        this.baseSize = Math.floor(Math.random() * 26) + 32;

        // Calibrated speed controls: Easy mode calculations are heavily padded
        const sizeFactor = (this.baseSize - 32) / 26;
        let speedMultiplier = currentDifficulty === "easy" ? 0.020 : 0.028; // speeding up cubes i think
        let speedVariance = currentDifficulty === "easy" ? 0.016 : 0.016; // sizing up (based around the size so it feels more like real life) which its best at 0.016
        this.speed = speedMultiplier + (sizeFactor * speedVariance) + Math.random() * 0.002;

        // Extended dispersion vectors maps nodes way wider out across visual frame edges
        this.targetX = (Math.random() - 0.5) * 920;
        this.targetY = (Math.random() - 0.5) * 620;
        this.z = 0;

        this.colors = ["#ff0055", "#0066ff", "#ffff00", "#ff00ff", "#00ff66"];
        this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
        this.isGolden = Math.random() < 0.10;
        if (this.isGolden) this.color = "#ffd700";

        this.sliced = false;
        this.sliceTime = 0;
        this.sliceParts = [];
    }

    update() {
        if (!this.sliced) {
            this.z += this.speed;
        } else {
            this.sliceTime++;
            for (let part of this.sliceParts) {
                part.x += part.vx;
                part.y += part.vy;
                part.vy += 0.4;
                part.alpha -= 0.025;
								part.rot += part.rv;
            }
        }
    }

    getScreenPos() {
        const x = vanishingPointX + this.targetX * this.z;
        const y = vanishingPointY + this.targetY * this.z;
        const scale = this.z * 1.5;
        const size = this.baseSize * scale;
        return { x, y, size, scale };
    }

    draw() {
        const pos = this.getScreenPos();
        if (pos.scale < 0.04) return;

        if (!this.sliced) {
            const inHitZone = this.z >= 0.75 && this.z <= 1.15;

            ctx.save();
            ctx.translate(pos.x, pos.y);

            if (this.isGolden) {
                ctx.shadowBlur = 35 * pos.scale;
                ctx.shadowColor = "#ffd700";
            } else {
                ctx.shadowBlur = inHitZone ? 45 * pos.scale : 20 * pos.scale;
                ctx.shadowColor = this.color;
            }

            ctx.fillStyle = this.color;
            ctx.fillRect(-pos.size / 2, -pos.size / 2, pos.size, pos.size);

            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.fillRect(-pos.size / 2 + 3, -pos.size / 2 + 3, pos.size - 6, pos.size - 6);

            if (inHitZone) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                ctx.lineWidth = 2.5;
                ctx.strokeRect(-pos.size / 2 - 4, -pos.size / 2 - 4, pos.size + 8, pos.size + 8);
            }

            // Native Target Core Circle Dot Marker
            ctx.shadowBlur = 5;
            ctx.shadowColor = "#ffffff";
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, 0, pos.size * 0.16, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        } else {
            // Split halves render engine: divides block array structures perfectly down vector cut axis
            for (let part of this.sliceParts) {
                if (part.alpha <= 0) continue;
                ctx.save();
                ctx.globalAlpha = part.alpha;
                ctx.translate(part.x, part.y);
                ctx.rotate(part.rot);
                ctx.shadowBlur = 20;
                ctx.shadowColor = this.color;

                ctx.fillStyle = this.color;
                if (part.side === "left") {
                    ctx.fillRect(-part.size / 2, -part.size / 2, part.size / 2, part.size);
                    ctx.fillStyle = "rgba(0,0,0,0.4)";
                    ctx.fillRect(-part.size / 2 + 2, -part.size / 2 + 2, part.size / 2 - 2, part.size - 4);
                    
                    // Splitting the inner white dot perfectly in half!
                    ctx.fillStyle = "#ffffff";
                    ctx.beginPath();
                    ctx.arc(0, 0, part.size * 0.16, Math.PI / 2, (Math.PI * 3) / 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(0, -part.size / 2, part.size / 2, part.size);
                    ctx.fillStyle = "rgba(0,0,0,0.4)";
                    ctx.fillRect(0, -part.size / 2 + 2, part.size / 2 - 2, part.size - 4);
                    
                    // Splitting the matching second half side of white dot node
                    ctx.fillStyle = "#ffffff";
                    ctx.beginPath();
                    ctx.arc(0, 0, part.size * 0.16, (Math.PI * 3) / 2, Math.PI / 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
    }

    isOffScreen() {
        if (!this.sliced) return this.z > 1.25;
        return this.sliceTime > 40;
    }

    checkSlice(mX, mY, lastMX, lastMY, vel) {
        if (this.sliced || this.z < 0.24 || this.z > 1.18) return false;

        const pos = this.getScreenPos();
        const dist = Math.sqrt(Math.pow(mX - pos.x, 2) + Math.pow(mY - pos.y, 2));

        if (dist < pos.size * 1.2 && vel > 6) {
            this.slice(mX - lastMX, mY - lastMY);
            return true;
        }
        return false;
    }

    slice(dx, dy) {
        this.sliced = true;
        const pos = this.getScreenPos();
        const splitAngle = Math.atan2(dy, dx);

        this.sliceParts = [
            { x: pos.x, y: pos.y, vx: -4 * Math.sin(splitAngle), vy: 4 * Math.cos(splitAngle) - 3, rot: splitAngle, rv: 0.2, alpha: 1, size: pos.size, side: "left" },
            { x: pos.x, y: pos.y, vx: 4 * Math.sin(splitAngle), vy: -4 * Math.cos(splitAngle) - 3, rot: splitAngle, rv: -0.2, alpha: 1, size: pos.size, side: "right" }
        ];

        createParticles(pos.x, pos.y, this.color, this.isGolden ? 35 : 18);
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        const speed = Math.random() * 8 + 2;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = Math.random() * 3 + 2;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.04 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.94;
        this.vy *= 0.94;
        this.alpha -= this.decay;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}

// Tracking coordinates router with high-density point generator pipeline
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    const dx = mouseX - lastMouseX;
    const dy = mouseY - lastMouseY;
    mouseVelocity = Math.sqrt(dx * dx + dy * dy);

    // Sub-pixel point injection engine interpolates trails when moving sabers fast!
    if (mouseVelocity > 12) {
        const steps = Math.min(Math.floor(mouseVelocity / 4), 6);
        for (let i = 1; i <= steps; i++) {
            const ratio = i / steps;
            saberTrail.push({
                x: lastMouseX + dx * ratio,
                y: lastMouseY + dy * ratio
            });
        }
    } else {
        saberTrail.push({ x: mouseX, y: mouseY });
        if (saberTrail.length > trailLength) saberTrail.shift();
    }

    while (saberTrail.length > trailLength * 2) saberTrail.shift();
});

// Configures Difficulty selection node maps
document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentDifficulty = btn.getAttribute("data-diff");
        
        if (currentDifficulty === "easy") {
            baseSpawnInterval = 85;
            minSpawnInterval = 45;
        } else {
            baseSpawnInterval = 35;
            minSpawnInterval = 12;
        }
        blockSpawnInterval = baseSpawnInterval;
    });
});

// Track Launcher Router
document.querySelectorAll(".songBtn").forEach(btn => {
    btn.addEventListener("click", () => {
        const song = btn.getAttribute("data-song");
        if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
        
        bgMusic = new Audio(song);
        bgMusic.loop = true;
        bgMusic.volume = isMuted ? 0 : 0.5;
        bgMusic.play().catch(() => {});

        document.getElementById("startScreen").style.display = "none";
        document.getElementById("pauseBtn").style.display = "block";
        gameState = "playing";
        resetGame();
    });
});

// Native System Display Router toggles hardware display states
document.getElementById("fullscreenBtn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
});

// Operational Interface Action Triggers
document.getElementById("pauseBtn").addEventListener("click", () => {
    if (gameState === "playing") {
        gameState = "paused";
        document.getElementById("pauseScreen").style.display = "block";
        if (bgMusic) bgMusic.pause();
    }
});

document.getElementById("resumeBtn").addEventListener("click", () => {
    document.getElementById("pauseScreen").style.display = "none";
    gameState = "playing";
    if (bgMusic && !isMuted) bgMusic.play().catch(() => {});
});

document.getElementById("muteBtn").addEventListener("click", () => {
    isMuted = !isMuted;
    document.getElementById("muteBtn").textContent = isMuted ? "🔇 UNMUTE" : "🔊 MUTE";
    if (bgMusic) bgMusic.volume = isMuted ? 0 : 0.5;
});

document.getElementById("quitBtn").addEventListener("click", () => {
    document.getElementById("pauseScreen").style.display = "none";
    document.getElementById("pauseBtn").style.display = "none";
    document.getElementById("startScreen").style.display = "block";
    gameState = "start";
    if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
});

document.getElementById("restartBtn").addEventListener("click", () => {
    document.getElementById("gameOver").style.display = "none";
    gameState = "playing";
    resetGame();
});

document.getElementById("winRestartBtn").addEventListener("click", () => {
    document.getElementById("winScreen").style.display = "none";
    document.getElementById("pauseBtn").style.display = "block";
    gameState = "playing";
    missed = 0;
    blocksSliced = 0;
});

function resetGame() {
    score = 0; combo = 0; maxCombo = 0; missed = 0; blocks = []; particles = [];
    blockSpawnTimer = 0; blockSpawnInterval = baseSpawnInterval; blocksSliced = 0;
    flowZoneActive = false;
    document.getElementById("score").textContent = "SCORE: 0";
    document.getElementById("combo").textContent = "COMBO: 0x";
}

// High stability fluid vector curved trail renderer routine
function drawSaber() {
    if (saberTrail.length > 2) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (let i = 2; i < saberTrail.length; i++) {
            const alpha = i / saberTrail.length;
            let color;
            if (flowZoneActive) {
                const hue = (Date.now() / 3 + i * 8) % 360;
                color = `hsla(${hue}, 100%, 65%, ${alpha})`;
            } else {
                color = saberTrail[i].x < canvas.width / 2 ? `rgba(255, 0, 85, ${alpha})` : `rgba(0, 221, 255, ${alpha})`;
            }

            ctx.beginPath();
            ctx.moveTo(saberTrail[i - 1].x, saberTrail[i - 1].y);
            
            const xc = (saberTrail[i - 1].x + saberTrail[i].x) / 2;
            const yc = (saberTrail[i - 1].y + saberTrail[i].y) / 2;
            ctx.quadraticCurveTo(saberTrail[i - 1].x, saberTrail[i - 1].y, xc, yc);

            ctx.lineWidth = (flowZoneActive ? 24 : 14) * alpha;
            ctx.strokeStyle = color;
            ctx.shadowBlur = flowZoneActive ? 35 * alpha : 12 * alpha;
            ctx.shadowColor = color;
            ctx.stroke();
        }
        ctx.restore();
    }

    const tipColor = flowZoneActive ? `hsl(${(Date.now() / 2) % 360}, 100%, 60%)` : (mouseX < canvas.width / 2 ? "#ff0055" : "#00ddff");
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = tipColor;
    ctx.fillStyle = tipColor;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (saberTrail.length > 0) saberTrail.shift();
}

function drawBackground() {
    ctx.save();
    let grad = ctx.createRadialGradient(vanishingPointX, vanishingPointY, 40, vanishingPointX, vanishingPointY, canvas.width * 0.75);
    
    if (flowZoneActive) {
        grad.addColorStop(0, "#08004d");
        grad.addColorStop(0.6, "#02001c");
        grad.addColorStop(1, "#000000");
    } else {
        grad.addColorStop(0, "#00002b");
        grad.addColorStop(0.5, "#010014");
        grad.addColorStop(1, "#000000");
    }
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = flowZoneActive ? "rgba(0, 255, 221, 0.2)" : "rgba(110, 40, 220, 0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(vanishingPointX, vanishingPointY);
        ctx.lineTo(vanishingPointX + Math.cos(angle) * canvas.width, vanishingPointY + Math.sin(angle) * canvas.height);
        ctx.stroke();
    }
    ctx.restore();
}

// Main game cycle
function gameLoop() {
    drawBackground();

    if (gameState === "playing") {
        if (flowZoneActive && Date.now() > flowZoneEndTime) {
            flowZoneActive = false;
        }

        blockSpawnTimer++;
        if (blockSpawnTimer >= blockSpawnInterval) {
            blocks.push(new Block());
            blockSpawnTimer = 0;
        }

        for (let i = blocks.length - 1; i >= 0; i--) {
            blocks[i].update();
            blocks[i].draw();

            if (blocks[i].isOffScreen()) {
                if (!blocks[i].sliced) {
                    missed++;
                    combo = 0;
                    flowZoneActive = false;
                    document.getElementById("combo").textContent = "COMBO: 0x";

                    if (missed >= maxMissed) {
                        gameState = "gameover";
                        document.getElementById("pauseBtn").style.display = "none";
                        document.getElementById("gameOver").style.display = "block";
                        document.getElementById("finalScore").innerHTML = `FINAL SCORE: <span class="highlight-text">${score}</span>`;
                        document.getElementById("finalCombo").innerHTML = `MAX COMBO: <span class="highlight-text">${maxCombo}x</span>`;
                        if (bgMusic) bgMusic.pause();
                    }
                }
                blocks.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].alpha <= 0) particles.splice(i, 1);
        }

        for (let block of blocks) {
            if (block.checkSlice(mouseX, mouseY, lastMouseX, lastMouseY, mouseVelocity)) {
                combo++;
                if (combo > maxCombo) maxCombo = combo;

                let scoreAward = 15 * combo;
                if (block.isGolden) { scoreAward *= 2; combo++; }
                if (flowZoneActive) scoreAward *= 2; 

                score += scoreAward;
                blocksSliced++;

                if (combo === 10 || (combo > 10 && combo % 15 === 0)) {
                    flowZoneActive = true;
                    flowZoneEndTime = Date.now() + 5000;
                }

                if (score >= winScore) {
                    gameState = "win";
                    document.getElementById("pauseBtn").style.display = "none";
                    document.getElementById("winScreen").style.display = "block";
                    document.getElementById("winScore").innerHTML = `VICTORY SCORE: <span class="highlight-text">${score}</span>`;
                    document.getElementById("winCombo").innerHTML = `MAX COMBO RECORD: <span class="highlight-text">${maxCombo}x</span>`;
                    if (bgMusic) bgMusic.pause();
                }

                if (blocksSliced % 8 === 0 && blockSpawnInterval > minSpawnInterval) {
                    blockSpawnInterval -= 3;
                }

                document.getElementById("score").textContent = `SCORE: ${score}`;
                document.getElementById("combo").textContent = `COMBO: ${combo}x`;
            }
        }

        drawSaber();

        ctx.fillStyle = missed > 7 ? "#ff0055" : "#ffffff";
        ctx.font = "bold 15px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`MISSED NODES: ${missed}/${maxMissed}`, canvas.width - 30, canvas.height - 30);

        if (flowZoneActive) {
            const timeLeft = Math.max(0, ((flowZoneEndTime - Date.now()) / 1000).toFixed(1));
            ctx.fillStyle = `hsl(${(Date.now() / 2) % 360}, 100%, 65%)`;
            ctx.font = "italic bold 30px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`⚡ THE FLOW ZONE: ${timeLeft}s (2X POINTS) ⚡`, canvas.width / 2, 60);
        }
    } else {
        drawSaber();
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();
