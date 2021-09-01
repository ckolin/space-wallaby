const dbg = (...objs) => {
    const enabled = location.hash === "#debug";
    if (objs.length > 0) {
        if (enabled) {
            console.log(objs);
        }
        return objs;
    } else {
        return enabled;
    }
};

const input = {
    action: false,
    pause: false
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// NYX8 by Javier Guerrero (https://lospec.com/palette-list/nyx8)
const colors = [
    "#08141e", "#0f2a3f", "#20394f", "#f6d6bd",
    "#c3a38a", "#997577", "#816271", "#4e495f",
];

const seed = Date.now();
const seededRandom = s => () => (2 ** 31 - 1 & (s = Math.imul(48271, s + seed))) / 2 ** 31;
const chunkRandom = c => seededRandom(c.y * 1e9 + c.x * 1e6);

const chunkSize = 42;
let chunks = [];

const camera = {
    size: 100,
    minSize: 100,
    maxSize: 200,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 }
};

const player = {
    debugColor: "#00f",
    sprite: {
        imageId: "wallaby",
        scale: 0.5
    },
    momentum: 0,
    jumpSpeed: 30,
    bonusJumpSpeed: 50,
    boostSpeed: 100,
    attachedMomentumFactor: -0.2,
    floatingMomentumFactor: 0.1,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    rotationalVelocity: 0,
    gravity: 0.8,
    collision: {
        radius: 2,
        attach: true
    }
};

let entities = [
    camera,
    player
];

let lastUpdate = Date.now();
const update = () => {
    const now = Date.now();
    const delta = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (input.pause) {
        return;
    }

    // Jumping and boosting
    if (input.action) {
        if (player.attachedTo) {
            const parent = player.attachedTo;

            const direction = Vec.normalize(Vec.scale(Vec.subtract(parent.position, player.position), -1));
            player.position = Vec.add(player.position, direction); // Move out of collision
            player.velocity = Vec.rotate(
                Vec.scale(direction, player.jumpSpeed + player.bonusJumpSpeed * player.momentum),
                parent.rotationalVelocity * delta
            );

            // Remove attachment
            parent.attached = parent.attached.filter(a => a !== player);
            player.attachedTo = null;

            input.action = false;
        } else if (player.momentum > 0) {
            // TODO: Boost
            player.momentum -= 1 * delta;
            const forward = Vec.normalize(player.velocity);
            player.velocity = Vec.add(player.velocity, Vec.scale(forward, player.boostSpeed * delta));
        } else {
            input.action = false;
        }
    }

    // Momentum
    if (player.attachedTo) {
        player.momentum += player.attachedMomentumFactor * delta;
    } else {
        player.momentum += player.floatingMomentumFactor * delta;
    }
    player.momentum = Math.max(0, Math.min(1, player.momentum));

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

    // Remove entities too far out of view
    entities = entities.filter(e => Vec.distance(e.position, camera.position) < camera.size * 2);

    // Generate new chunks
    const newChunks = chunks.filter(c => !previousChunks.some(p => p.x === c.x && p.y === c.y));
    for (let chunk of newChunks) {
        const random = chunkRandom(chunk);

        // Create stars
        const numStars = random() * 4;
        for (let i = 0; i < numStars; i++) {
            entities.push({
                star: {
                    size: Math.ceil(random() * 2),
                },
                chunk,
                position: Vec.scale({ x: chunk.x + random(), y: chunk.y + random() }, chunkSize)
            });
        }

        // Create planet if needed
        if (random() < 0.3) {
            entities.push({
                planet: {
                    radius: Math.ceil((random() * 0.2 + 0.05) * chunkSize),
                    stripeSpacing: Math.ceil(random() * 3)
                },
                attached: [],
                chunk,
                position: Vec.floor(Vec.scale({ x: chunk.x + random() * 0.4, y: chunk.y + random() * 0.4 }, chunkSize)),
                rotation: random() * 2 * Math.PI,
                rotationalVelocity: (random() * 3 + 1) * (random() < 0.5 ? 1 : -1)
            });
        }

        // Create spaceship if needed
        if (Math.random() < 0.01) {
            entities.push({
                spaceship: {
                    speed: 10,
                },
                sprite: {
                    imageId: "spaceship",
                    scale: 0.75
                },
                position: Vec.scale({ x: chunk.x, y: chunk.y }, chunkSize),
                velocity: { x: Math.random() * 10, y: 0 },
                rotation: random() * 2 * Math.PI,
                rotationalVelocity: 0,
                collision: {
                    radius: 4,
                    attach: false
                }
            })
        }
    }

    // Camera
    camera.velocity = Vec.add(Vec.scale(player.velocity, 0.5), Vec.subtract(player.position, camera.position));
    camera.size = Math.min(camera.maxSize, Vec.distance2(player.position, camera.position) + camera.minSize);

    // Gravity
    const planets = entities.filter(e => e.planet);
    for (let entity of entities.filter(e => e.gravity && !e.attachedTo)) {
        let force = { x: 0, y: 0 };

        for (let planet of planets) {
            const between = Vec.subtract(planet.position, entity.position);
            const distance = Vec.length(between);

            force = Vec.add(
                force,
                Vec.scale(
                    Vec.normalize(between),
                    planet.planet.radius ** 3 / distance
                )
            );
        }

        entity.velocity = Vec.add(entity.velocity, Vec.scale(force, entity.gravity * delta));
    }

    // Collision
    for (let entity of entities.filter(e => e.collision && !e.attachedTo)) {
        for (let planet of planets) {
            const between = Vec.subtract(planet.position, entity.position);
            const collisionDistance = planet.planet.radius + entity.collision.radius;

            // Collision
            if (entity.collision && Vec.length(between) < collisionDistance) {
                if (entity.collision.attach) {
                    // Stop movement and rotation
                    entity.velocity = force = { x: 0, y: 0 };
                    entity.rotationalVelocity = 0;

                    // Set exact position
                    entity.position = Vec.add(
                        planet.position,
                        Vec.scale(Vec.normalize(between), -collisionDistance)
                    );

                    // Attach
                    entity.attachedTo = planet;
                    planet.attached.push(entity);

                    break;
                } else {
                    // TODO: Bounce off correctly, move out of collision
                    entity.velocity = Vec.scale(entity.velocity, -1);
                }

                break;
            }
        }
    }

    // Velocity
    for (let entity of entities.filter(e => e.velocity)) {
        const translation = Vec.scale(entity.velocity, delta);
        entity.position = Vec.add(entity.position, translation);

        // Move attached entities
        if (entity.attached) {
            for (let attached of entity.attached) {
                attached.position = Vec.add(attached.position, translation);
            }
        }
    }

    // Rotation
    for (let entity of entities.filter(e => e.rotationalVelocity)) {
        const rotation = entity.rotationalVelocity * delta
        entity.rotation += rotation;

        // Rotate attached entities
        if (entity.attached) {
            for (let attached of entity.attached) {
                const offset = Vec.rotate(Vec.subtract(attached.position, entity.position), rotation);
                attached.position = Vec.add(entity.position, offset);
                attached.rotation += rotation;
            }
        }
    }
};

const draw = () => {
    update();

    // Draw backgruond
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center around camera
    ctx.save();
    const scale = canvas.width / camera.size;
    ctx.scale(scale, scale);
    const topLeft = Vec.add(camera.position, Vec.scale({ x: 1, y: 1 }, -camera.size / 2));
    ctx.translate(-topLeft.x, -topLeft.y);

    // Draw stars
    ctx.fillStyle = colors[1];
    for (let entity of entities.filter(e => e.star)) {
        ctx.fillRect(entity.position.x, entity.position.y, entity.star.size, entity.star.size);
    }

    // Draw planets
    for (let entity of entities.filter(e => e.planet)) {
        ctx.save();
        ctx.translate(entity.position.x, entity.position.y);
        ctx.rotate(entity.rotation);
        ctx.translate(-0.5, -0.5); // Make centered

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

        const random = chunkRandom(entity.chunk);
        const firstColor = Math.round(random()) + 5;
        for (let y = -r; y <= r; y++) {
            const w = width[y];
            ctx.fillStyle = colors[firstColor];
            ctx.fillRect(-w, y, 2 * w + 1, 1);

            if (y % entity.planet.stripeSpacing == 0) {
                ctx.fillStyle = colors[firstColor + 1];
                ctx.fillRect(-w, y, random() * 2 * w, 1);
            }
        }

        ctx.restore();
    }

    // Draw sprites
    for (let entity of entities.filter(e => e.sprite)) {
        ctx.save();
        ctx.translate(entity.position.x, entity.position.y);
        ctx.rotate(entity.rotation);

        const image = document.getElementById(entity.sprite.imageId);
        const size = Vec.scale({ x: image.naturalWidth, y: image.naturalHeight }, entity.sprite.scale);
        ctx.translate(-size.x / 2, -size.y / 2); // Center image
        ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, size.x, size.y);

        ctx.restore();
    }

    // Debug overlay
    if (dbg()) {
        ctx.save();
        ctx.globalAlpha = 0.5;

        // Origin
        for (let entity of entities.filter(e => e.position)) {
            ctx.fillStyle = entity.debugColor || "#f00";
            ctx.fillRect(entity.position.x, entity.position.y, 1, 1);
        }

        // Velocity vector
        for (let entity of entities.filter(e => e.velocity)) {
            const end = Vec.add(entity.position, entity.velocity);
            ctx.strokeStyle = "#0f0";
            ctx.beginPath();
            ctx.moveTo(entity.position.x, entity.position.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }

        // Planet radius
        for (let entity of entities.filter(e => e.planet)) {
            ctx.strokeStyle = "#f00";
            ctx.beginPath();
            ctx.arc(entity.position.x, entity.position.y, entity.planet.radius, 0, 2 * Math.PI);
            ctx.stroke();
        }

        ctx.restore();
    }

    ctx.restore();

    // Draw hud
    ctx.fillStyle = colors[7];
    ctx.fillRect(0, 0, canvas.width * player.momentum, 12);

    requestAnimationFrame(draw);
};

// Input
window.addEventListener("blur", () => input.pause = true);
window.addEventListener("focus", () => input.pause = false);

canvas.addEventListener("mousedown", () => input.action = true);
canvas.addEventListener("mouseup", () => input.action = false);

canvas.addEventListener("touchstart", () => input.action = true);
canvas.addEventListener("touchend", () => input.action = false);

document.addEventListener("keydown", (e) => {
    if (e.repeat) {
        return;
    }

    if (e.key === " ") {
        input.action = true;
    }
});

document.addEventListener("keyup", (e) => {
    if (e.repeat) {
        return;
    }

    if (e.key === " ") {
        input.action = false;
    }
});

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