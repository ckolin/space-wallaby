const dbg = (obj) => { console.log(obj); return obj; };
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const colors = [
    "#8cffde", "#45b8b3", "#839740", "#c9ec85", "#46c657", "#158968", "#2c5b6d", "#222a5c",
    "#566a89", "#8babbf", "#cce2e1", "#ffdba5", "#ccac68", "#a36d3e", "#683c34", "#000000",
    "#38002c", "#663b93", "#8b72de", "#9cd8fc", "#5e96dd", "#3953c0", "#800c53", "#c34b91",
    "#ff94b3", "#bd1f3f", "#ec614a", "#ffa468", "#fff6ae", "#ffda70", "#f4b03c", "#ffffff"];

const seed = Date.now();
const seededRandom = s => () => (2 ** 31 - 1 & (s = Math.imul(48271, s + seed))) / 2 ** 31;

const camera = {
    position: { x: 0, y: 0 },
    velocity: { x: 3, y: 1 },
    size: 150,
    sizeVelocity: 0
};

const chunkSize = 42;
let chunks = [];
let entities = [];

let lastUpdate = Date.now();
const update = () => {
    const now = Date.now();
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    camera.position = Vec.add(camera.position, Vec.scale(camera.velocity, delta));
    camera.size += camera.sizeVelocity * delta;

    const previousChunks = chunks;
    chunks = [];
    for (let x = Math.floor(camera.position.x / chunkSize) - 1; (x - 1) * chunkSize < Math.ceil(camera.position.x + camera.size); x++) {
        for (let y = Math.floor(camera.position.y / chunkSize) - 1; (y - 1) * chunkSize < Math.ceil(camera.position.y + camera.size); y++) {
            chunks.push({ x, y });
        }
    }

    // Remove entities belonging to inactive chunks
    entities = entities.filter(e => !e.chunk || chunks.some(c => c.x === e.chunk.x && c.y === e.chunk.y));

    // Generate new chunks
    for (let chunk of chunks) {
        if (previousChunks.some(c => c.x === chunk.x && c.y === chunk.y)) {
            continue;
        }

        const random = seededRandom(chunk.y * 1e9 + chunk.x * 1e6);

        // Create stars
        const numStars = random() * 3;
        for (let i = 0; i < numStars; i++) {
            entities.push({
                position: Vec.scale({ x: chunk.x + random(), y: chunk.y + random() }, chunkSize),
                star: {
                    size: Math.ceil(random() * 2),
                    opacity: random() * 0.5 + 0.1
                },
                chunk
            });
        }

        // Create planet if any
        if (random() < 0.2) {
            entities.push({
                position: Vec.floor(Vec.scale({ x: chunk.x + random() * 0.4, y: chunk.y + random() * 0.4 }, chunkSize)),
                planet: {
                    radius: Math.round((random() * 0.2 + 0.1) * chunkSize),
                    color: colors[Math.floor(random() * 6)]
                },
                chunk
            });
        }
    }
};

const draw = () => {
    update();

    // Draw backgruond
    ctx.fillStyle = colors[15];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    const scale = canvas.width / camera.size;
    ctx.scale(scale, scale);
    ctx.translate(-camera.position.x, -camera.position.y);

    // Draw stars
    for (let entity of entities.filter(e => e.star)) {
        ctx.fillStyle = colors[31];
        ctx.globalAlpha = entity.star.opacity;
        ctx.fillRect(entity.position.x, entity.position.y, entity.star.size, entity.star.size);
    }
    ctx.globalAlpha = 1;

    // Draw planets
    for (let entity of entities.filter(e => e.planet)) {
        ctx.fillStyle = entity.planet.color;

        // Mid-point circle drawing
        const p = entity.position;
        const r = entity.planet.radius;
        let x = r, y = 0;
        
        ctx.fillRect(p.x + x, p.y + y, 1, 1);
        ctx.fillRect(p.x - x, p.y - y, 1, 1);
        ctx.fillRect(p.x - y, p.y + x, 1, 1);
        ctx.fillRect(p.x - y, p.y - x, 1, 1);
        
        let val = 1 - r;
        while (x > y) {
            y++;
            
            if (val <= 0) {
                val += 2 * y + 1;
            } else {
                x--;
                val += 2 * y - 2 * x + 1;
            }

            if (x < y) {
                break;
            }

            ctx.fillRect(p.x + x, p.y + y, 1, 1);
            ctx.fillRect(p.x + x, p.y - y, 1, 1);
            ctx.fillRect(p.x - x, p.y + y, 1, 1);
            ctx.fillRect(p.x - x, p.y - y, 1, 1);

            if (x !== y) {
                ctx.fillRect(p.x + y, p.y + x, 1, 1);
                ctx.fillRect(p.x + y, p.y - x, 1, 1);
                ctx.fillRect(p.x - y, p.y + x, 1, 1);
                ctx.fillRect(p.x - y, p.y - x, 1, 1);
            }
        }
    }

    ctx.restore();

    requestAnimationFrame(draw);
};

const resize = () => {
    canvas.width = canvas.height = 600;
    ctx.imageSmoothingEnabled = false;
};

resize();
draw();