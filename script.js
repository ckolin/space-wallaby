const dbg = (obj) => {
    if (obj) {
        console.log(obj);
        return obj;
    } else {
        return location.hash === "#debug";
    }
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const colors = [
    "#8cffde", "#45b8b3", "#839740", "#c9ec85", "#46c657", "#158968", "#2c5b6d", "#222a5c",
    "#566a89", "#8babbf", "#cce2e1", "#ffdba5", "#ccac68", "#a36d3e", "#683c34", "#000000",
    "#38002c", "#663b93", "#8b72de", "#9cd8fc", "#5e96dd", "#3953c0", "#800c53", "#c34b91",
    "#ff94b3", "#bd1f3f", "#ec614a", "#ffa468", "#fff6ae", "#ffda70", "#f4b03c", "#ffffff"
];

const seed = Date.now();
const seededRandom = s => () => (2 ** 31 - 1 & (s = Math.imul(48271, s + seed))) / 2 ** 31;

const camera = {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    size: 150,
    sizeVelocity: 0
};

const player = {
    debugColor: "green",
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    gravity: 1
};

const chunkSize = 42;
let chunks = [];

let entities = [
    camera,
    player
];

let paused = false;

let lastUpdate = Date.now();
const update = () => {
    const now = Date.now();
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (paused) {
        return;
    }

    // Find active chunks
    const previousChunks = chunks;
    chunks = [];
    const topLeft = Vec.add(camera.position, Vec.scale({ x: 1, y: 1 }, -camera.size / 2));
    for (let x = Math.floor(topLeft.x / chunkSize) - 1; (x - 1) * chunkSize < Math.ceil(topLeft.x + camera.size); x++) {
        for (let y = Math.floor(topLeft.y / chunkSize) - 1; (y - 1) * chunkSize < Math.ceil(topLeft.y + camera.size); y++) {
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
                rotation: random() * 2 * Math.PI,
                rotationalVelocity: (random() - 0.5) * 3,
                planet: {
                    radius: Math.round((random() * 0.2 + 0.1) * chunkSize),
                    color: colors[Math.floor(random() * 10)]
                },
                chunk
            });
        }
    }

    // Camera
    camera.velocity = Vec.add(Vec.scale(player.velocity, 0.5), Vec.subtract(player.position, camera.position));
    camera.size += camera.sizeVelocity * delta;

    // Gravity
    const planets = entities.filter(e => e.planet);
    for (let entity of entities.filter(e => e.gravity)) {
        let force = { x: 0, y: 0 };

        for (let planet of planets) {
            const between = Vec.subtract(planet.position, entity.position);
            const distance = Vec.length(between);

            // Collision
            if (distance < planet.planet.radius) {
                // Do something
            }

            force = Vec.add(
                force,
                Vec.scale(
                    Vec.scale(between, 1 / distance),
                    planet.planet.radius ** 2 / distance
                )
            );
        }

        entity.velocity = Vec.add(entity.velocity, Vec.scale(force, entity.gravity * delta));
    }

    // Velocity
    for (let entity of entities.filter(e => e.velocity)) {
        entity.position = Vec.add(entity.position, Vec.scale(entity.velocity, delta));
    }

    // Rotation
    for (let entity of entities.filter(e => e.rotationalVelocity)) {
        entity.rotation += entity.rotationalVelocity * delta;
    }
};

const draw = () => {
    update();

    // Draw backgruond
    ctx.fillStyle = colors[15];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center around camera
    ctx.save();
    const scale = canvas.width / camera.size;
    ctx.scale(scale, scale);
    const topLeft = Vec.add(camera.position, Vec.scale({ x: 1, y: 1 }, -camera.size / 2));
    ctx.translate(-topLeft.x, -topLeft.y);

    // Draw stars
    for (let entity of entities.filter(e => e.star)) {
        ctx.fillStyle = colors[31];
        ctx.globalAlpha = entity.star.opacity;
        ctx.fillRect(entity.position.x, entity.position.y, entity.star.size, entity.star.size);
    }
    ctx.globalAlpha = 1;

    // Draw planets
    for (let entity of entities.filter(e => e.planet)) {
        ctx.save();
        ctx.translate(entity.position.x, entity.position.y);
        ctx.rotate(entity.rotation);

        // Mid-point circle drawing
        const width = {};
        const add = (x, y) => width[y] = y in width ? Math.max(width[y], x) : x;
        const r = entity.planet.radius;
        let x = r, y = 0;

        add(+x, +y);

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

            add(+x, +y);
            add(+x, -y);
            if (x !== y) {
                add(+y, +x);
                add(+y, -x);
            }
        }

        ctx.fillStyle = entity.planet.color;
        for (let y = -r; y <= r; y++) {
            ctx.fillRect(-width[y], y, 2 * width[y] + 1, 1);
        }

        ctx.restore();
    }

    // Draw player
    ctx.fillStyle = colors[0];
    ctx.fillRect(player.position.x - 3, player.position.y - 3, 6, 6);

    // Debug overlay
    if (dbg()) {
        for (let entity of entities.filter(e => e.position)) {
            ctx.fillStyle = entity.debugColor || "red";
            ctx.fillRect(entity.position.x, entity.position.y, 1, 1);
        }
    }

    ctx.restore();

    requestAnimationFrame(draw);
};

// Pause
window.addEventListener("blur", () => paused = true);
window.addEventListener("focus", () => paused = false);

// Canvas resizing
const resize = () => {
    const unit = 64;
    const size = Math.min(Math.floor(Math.min(window.innerWidth, window.innerHeight) / unit), 12);
    canvas.width = canvas.height = size * unit;
    canvas.style.left = `${(window.innerWidth - canvas.width) / 2}px`;
    canvas.style.top = `${(window.innerHeight - canvas.height) / 2}px`;
    ctx.imageSmoothingEnabled = false;
};
window.addEventListener("resize", resize);
resize();

draw();