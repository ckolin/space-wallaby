const dbg = (obj) => { console.log(obj); return obj; };
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const colors = [
    "#8cffde", "#45b8b3", "#839740", "#c9ec85", "#46c657", "#158968", "#2c5b6d", "#222a5c",
    "#566a89", "#8babbf", "#cce2e1", "#ffdba5", "#ccac68", "#a36d3e", "#683c34", "#000000",
    "#38002c", "#663b93", "#8b72de", "#9cd8fc", "#5e96dd", "#3953c0", "#800c53", "#c34b91",
    "#ff94b3", "#bd1f3f", "#ec614a", "#ffa468", "#fff6ae", "#ffda70", "#f4b03c", "#ffffff"];

const seed = Date.now();
const seededRandom = s => () => (2**31 - 1 & (s = Math.imul(48271, s + seed))) / 2**31;

const camera = {
    position: {x: 0, y: 0},
    velocity: {x: 15, y: 2},
    size: 50,
    sizeVelocity: 1
};

const chunkSize = 10;
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
            chunks.push({x, y});
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
        const numStars = random() * 5;
        for (let i = 0; i < numStars; i++) {
            entities.push({
                position: Vec.scale({x: chunk.x + random(), y: chunk.y + random()}, chunkSize),
                star: {size: random() * 0.3},
                chunk
            });
        }

        // Create planet if any
        if (random() < 0.2) {
            entities.push({
                position: Vec.scale({x: chunk.x + random() * 0.4, y: chunk.y + random() * 0.4 }, chunkSize),
                planet: {
                    radius: (random() * 0.2 + 0.1) * chunkSize,
                    color: colors[Math.floor(random() * 32)]
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

    for (let entity of entities) {
        if (entity.star) {
            ctx.fillStyle = colors[31];
            ctx.fillRect(entity.position.x, entity.position.y, entity.star.size, entity.star.size);
        }

        if (entity.planet) {
            ctx.fillStyle = entity.planet.color;
            ctx.beginPath();
            ctx.arc(entity.position.x, entity.position.y, entity.planet.radius, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    ctx.restore();

    requestAnimationFrame(draw);
};

const resize = () => {
    canvas.width = canvas.height = 500;
    ctx.imageSmoothingEnabled = true;
};

resize();
draw();