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

// Steam Lords palette by Slynyrd (https://lospec.com/palette-list/steam-lords)
const colors = [
    "#213b25", "#3a604a", "#4f7754", "#a19f7c",
    "#77744f", "#775c4f", "#603b3a", "#3b2137",
    "#170e19", "#2f213b", "#433a60", "#4f5277",
    "#65738c", "#7c94a1", "#a0b9ba", "#c0d1cc"
];

// Seeded random number generator
const seed = Date.now();
const seededRandom = s => () => (2 ** 31 - 1 & (s = Math.imul(48271, s + seed))) / 2 ** 31;

// World generation settings
const world = {
    chunkSize: 42,
    minJoeyDistance: 200,
    joeyDistanceRandom: 100,
    maxStars: 4,
    planetChance: 0.3,
    minPlanetRadius: 2,
    planetRadiusRandom: 8,
    minPlanetRotationalVelocity: 1,
    planetRotationalVelocityRandom: 3,
    spaceshipChance: 0.01,
};

// Chunk system for procedural generation
const getChunk = position => {
    const chunk = Vec.floor(Vec.scale(position, 1 / world.chunkSize));
    chunk.id = chunk.y * 1e9 + chunk.x;
    return chunk;
};
let chunks = [];

// Things that need to be generated in a certain chunk
const specials = {
    0: {
        planet: false
    }
};

const camera = {
    view: {
        size: 100,
        minSize: 100,
        maxSize: 200,
        playerDistanceSizeFactor: 4,
        speed: 2,
    },
    keep: true,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 }
};

let score = 0;
const player = {
    sprite: {
        imageId: "wallaby",
        scale: 0.5
    },
    wallaby: {
        momentum: 0,
        jumpSpeed: 20,
        boostSpeed: 60,
        attachedMomentumFactor: -0.2,
        floatingMomentumFactor: 0.1,
        boostingMomentumFactor: -0.8,
    },
    keep: true,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    rotationalVelocity: 0,
    gravity: 0.8,
    collision: {
        radius: 4,
        attach: true
    }
};

let entities = [
    camera,
    player
];

let lastUpdate = performance.now();
const update = () => {
    const now = performance.now();
    const deltaMs = now - lastUpdate;
    const delta = deltaMs / 1000;
    lastUpdate = now;

    if (input.pause) {
        return;
    }

    // Spawn joey if none exists
    if (!entities.some(e => e.sprite?.imageId === "joey")) {
        const distance = score === 0 ? world.chunkSize * 2
            : Math.random() * world.joeyDistanceRandom + world.minJoeyDistance;
        const chunk = getChunk(Vec.add(
            player.position,
            Vec.rotate(
                { x: distance, y: 0 },
                Math.random() * 2 * Math.PI
            )
        ));

        specials[chunk.id] = {
            joey: true,
            planet: true
        };

        entities.push({
            sprite: {
                imageId: "joey",
                scale: 0.5
            },
            keep: true,
            chunkId: chunk.id,
            position: Vec.scale(chunk, world.chunkSize),
            velocity: { x: 0, y: 0 },
            rotation: 0,
            rotationalVelocity: 0,
            collision: {
                radius: 3,
                attach: true
            }
        });
    }

    // Find active chunks
    const previousChunks = chunks;
    chunks = [];
    const screenHalf = Vec.scale({ x: 1, y: 1 }, camera.view.size / 2);
    const start = Vec.subtract(camera.position, screenHalf);
    const end = Vec.add(camera.position, screenHalf);
    const overscan = world.chunkSize * 2;
    for (let x = start.x - overscan; x <= end.x + overscan; x += world.chunkSize) {
        for (let y = start.y - overscan; y <= end.y + overscan; y += world.chunkSize) {
            chunks.push(getChunk({ x, y }));
        }
    }

    // Generate new chunks
    const newChunks = chunks.filter(c => !previousChunks.some(p => p.id === c.id));
    for (let chunk of newChunks) {
        const random = seededRandom(chunk.id);
        const chunkOrigin = Vec.scale(chunk, world.chunkSize);
        const special = specials[chunk.id];

        // Create stars
        if (special?.stars == null ? true : special.stars) {
            const numStars = random() * world.maxStars;
            for (let i = 0; i < numStars; i++) {
                entities.push({
                    star: {
                        size: Math.ceil(random() * 2),
                        color: colors[Math.floor(random() * 2 + 9)]
                    },
                    chunkId: chunk.id,
                    position: Vec.add(chunkOrigin, Vec.scale({ x: random(), y: random() }, world.chunkSize))
                });
            }
        }

        // Create planet
        if (special?.planet == null ? random() < world.planetChance : special.planet) {
            const position = Vec.floor(
                Vec.add(
                    chunkOrigin,
                    Vec.scale({ x: random() * 0.4, y: random() * 0.4 }, world.chunkSize)
                )
            );
            const startColors = [0, 1, 3, 6, 10, 11, 12];
            const startColor = startColors[Math.floor(random() * startColors.length)];

            entities.push({
                planet: {
                    radius: Math.ceil(random() * world.planetRadiusRandom + world.minPlanetRadius),
                    stripeSpacing: Math.ceil(random() * 3),
                    firstColor: colors[startColor],
                    secondColor: colors[startColor + 1]
                },
                spring: {
                    origin: position,
                    stiffness: 0.1
                },
                chunkId: chunk.id,
                position,
                velocity: { x: 0, y: 0 },
                damping: 0.8,
                rotation: random() * 2 * Math.PI,
                rotationalVelocity: (random() * world.planetRotationalVelocityRandom + world.minPlanetRotationalVelocity)
                    * (random() < 0.5 ? 1 : -1)
            });
        }

        // Make sure joey gets attached to planet
        if (special?.joey && special?.planet) {
            const joey = entities.find(e => e.sprite?.imageId === "joey" && e.chunkId === chunk.id);
            const planet = entities.find(e => e.planet && e.chunkId === chunk.id);
            joey.rotation = 0;
            joey.position = Vec.add(planet.position, { x: 0, y: -1 });
        }

        // Create spaceship
        if (special?.spaceship == null ? Math.random() < world.spaceshipChance : special.spaceship) {
            entities.push({
                spaceship: {
                    speed: 10,
                    rotationSpeed: 1,
                    state: "idle",
                    since: 0
                },
                sprite: {
                    imageId: "spaceship",
                    scale: 0.75
                },
                position: chunkOrigin,
                velocity: { x: Math.random() * 10, y: 0 },
                damping: 0.2,
                rotation: Math.random() * 2 * Math.PI,
                rotationalVelocity: 0,
                rotationalDamping: 0.8,
                collision: {
                    radius: 8,
                    attach: false
                }
            });
        }
    }

    // Camera
    camera.velocity = Vec.scale(
        Vec.add(
            Vec.scale(player.velocity, 0.2),
            Vec.subtract(player.position, camera.position)
        ),
        camera.view.speed
    );
    camera.view.size = Math.min(
        camera.view.maxSize,
        Vec.distance(player.position, camera.position) * camera.view.playerDistanceSizeFactor + camera.view.minSize
    );

    // Player jumping and boosting
    if (input.action) {
        if (player.attachedTo) {
            const direction = Vec.normalize(Vec.scale(Vec.subtract(player.attachedTo.position, player.position), -1));
            player.position = Vec.add(player.position, direction); // Move out of collision
            player.velocity = Vec.rotate(
                Vec.scale(direction, player.wallaby.jumpSpeed),
                player.attachedTo.rotationalVelocity * delta
            );

            // Remove attachment
            player.attachedTo = null;
        } else if (player.wallaby.momentum > 0) {
            player.wallaby.momentum += player.wallaby.boostingMomentumFactor * delta;
            const forward = Vec.normalize(player.velocity);
            player.velocity = Vec.add(player.velocity, Vec.scale(forward, player.wallaby.boostSpeed * delta));

            // Spawn particles
            for (let i = 0; i < deltaMs / 4; i++) {
                entities.push({
                    particle: {
                        color: colors[15],
                        size: Math.random() + 0.5
                    },
                    age: 0,
                    lifetime: Math.random() * 500 + 400,
                    position: player.position,
                    velocity: Vec.scale(Vec.rotate(forward, (Math.random() - 0.5) * 2), -(Math.random() * 10 + 10)),
                    collision: {
                        radius: 1,
                        attach: false
                    }
                });
            }
        } else {
            input.action = false;
        }
    }

    // Player momentum
    if (player.attachedTo) {
        player.wallaby.momentum += player.wallaby.attachedMomentumFactor * delta;
    } else {
        player.wallaby.momentum += player.wallaby.floatingMomentumFactor * delta;
    }
    player.wallaby.momentum = Math.max(0, Math.min(1, player.wallaby.momentum));

    // Spaceship logic
    for (let entity of entities.filter(e => e.spaceship)) {
        entity.spaceship.since += deltaMs;
        let newState;

        switch (entity.spaceship.state) {
            case "idle":
                if (entity.spaceship.since > 1000) {
                    newState = "rotate";
                }
                break;
            case "rotate":
                let angle = Vec.angle(Vec.subtract(player.position, entity.position)) - entity.rotation;
                if (angle > Math.PI) {
                    angle -= 2 * Math.PI;
                } else if (angle <= -Math.PI) {
                    angle + 2 * Math.PI;
                }
                entity.rotationalVelocity += angle * entity.spaceship.rotationSpeed * delta;

                if (entity.spaceship.since > 1000) {
                    newState = Math.random() < 0.5 ? "boost" : "shoot";
                }
                break;
            case "boost":
                entity.velocity = Vec.add(
                    entity.velocity,
                    Vec.scale(Vec.rotate({ x: 1, y: 0 }, entity.rotation), entity.spaceship.speed * delta)
                );

                if (entity.spaceship.since > 5000) {
                    newState = "idle";
                }
                break;
            case "shoot":
                newState = "idle";
                break;
        }

        if (newState) {
            entity.spaceship.since = 0;
            entity.spaceship.state = newState;
        }
    }

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

    // Planet collision
    for (let entity of entities.filter(e => e.collision && !e.attachedTo)) {
        for (let planet of planets) {
            const between = Vec.subtract(planet.position, entity.position);
            const collisionDistance = planet.planet.radius + entity.collision.radius;

            if (Vec.length(between) > collisionDistance) {
                continue; // Too far away
            }

            if (entity.collision.attach) {
                // Stop player from jumping again
                if (entity === player) {
                    input.action = false;
                }

                // Make planet wobble
                const rel = Vec.subtract(entity.velocity, planet.velocity);
                const tangent = Vec.normalize(
                    Vec.multiply(
                        Vec.flip(Vec.subtract(planet.position, entity.position)),
                        { x: 1, y: -1 }
                    )
                );
                const paraLen = Vec.dot(rel, tangent);
                const para = Vec.scale(tangent, paraLen);
                const perp = Vec.scale(Vec.subtract(rel, para), 1);
                planet.velocity = Vec.scale(perp, 1 / 4);

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
            } else {
                // Resolve collision
                const normal = Vec.normalize(Vec.subtract(planet.position, entity.position));
                const rel = Vec.subtract(entity.velocity, planet.velocity);

                if (Vec.dot(rel, normal) < 0) {
                    continue; // Entities are alrady moving apart
                }

                const tangent = Vec.normalize(
                    Vec.multiply(
                        Vec.flip(Vec.subtract(planet.position, entity.position)),
                        { x: 1, y: -1 }
                    )
                );
                const paraLen = Vec.dot(rel, tangent);
                const para = Vec.scale(tangent, paraLen);
                const perp = Vec.scale(Vec.subtract(rel, para), 1);

                entity.velocity = Vec.scale(perp, -3 / 4);
            }

            break;
        }
    }

    // Joey collision
    for (let entity of entities.filter(e => e.sprite?.imageId === "joey")) {
        const distance = Vec.distance(entity.position, player.position);
        if (distance < entity.collision.radius + player.collision.radius) {
            score++;
            entity.destroy = true;
            delete specials[entity.chunkId].joey;
        }
    }

    // Velocity
    for (let entity of entities.filter(e => e.velocity)) {
        if (entity.attachedTo) {
            entity.position = Vec.add(entity.position, Vec.scale(entity.attachedTo.velocity, delta));
        } else {
            entity.position = Vec.add(entity.position, Vec.scale(entity.velocity, delta));
        }
    }

    // Spring
    for (let entity of entities.filter(e => e.spring)) {
        entity.velocity = Vec.add(
            entity.velocity,
            Vec.scale(
                Vec.subtract(entity.spring.origin, entity.position),
                entity.spring.stiffness
            )
        );
    }

    // Rotation
    for (let entity of entities.filter(e => e.rotationalVelocity !== null)) {
        if (entity.attachedTo) {
            const rotation = entity.attachedTo.rotationalVelocity * delta;
            const offset = Vec.rotate(
                Vec.subtract(entity.position, entity.attachedTo.position),
                rotation
            );
            entity.position = Vec.add(entity.attachedTo.position, offset);
            entity.rotation += rotation;
        } else {
            entity.rotation += entity.rotationalVelocity * delta;
        }
        entity.rotation %= 2 * Math.PI;
    }

    // Damping
    for (let entity of entities.filter(e => e.damping)) {
        entity.velocity = Vec.scale(entity.velocity, 1 - entity.damping * delta);
    }
    for (let entity of entities.filter(e => e.rotationalDamping)) {
        entity.rotationalVelocity *= 1 - entity.rotationalDamping * delta;
    }

    // Increase age
    for (let entity of entities.filter(e => e.age != null)) {
        entity.age += deltaMs;
    }

    entities
        .filter(e => !e.keep)
        .filter(e =>
            (e.chunkId && !chunks.some(c => c.id === e.chunkId)) // Remove entities belonging to inactive chunks
            || Vec.distance(e.position, camera.position) > camera.size * 2 // Remove entities too far out of view
            || (e.lifetime && e.age > e.lifetime)) // Remove entities with no lifetime left
        .forEach(e => e.destroy = true);

    // Remove entities marked to be destroyed
    entities = entities.filter(e => !e.destroy);

    // Remove attachments that where one entity destroyed
    for (let entity of entities.filter(e => e.attachedTo?.destroy)) {
        entity.attachedTo = null;
    }
};

const draw = () => {
    update();

    // Draw backgruond
    ctx.fillStyle = colors[8];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center around camera
    ctx.save();
    const scale = canvas.width / camera.view.size;
    ctx.scale(scale, scale);
    const topLeft = Vec.add(camera.position, Vec.scale({ x: 1, y: 1 }, -camera.view.size / 2));
    ctx.translate(-topLeft.x, -topLeft.y);

    // Draw stars
    for (let entity of entities.filter(e => e.star)) {
        ctx.fillStyle = entity.star.color;
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

        const random = seededRandom(entity.chunkId);
        for (let y = -r; y <= r; y++) {
            const w = width[y];
            ctx.fillStyle = entity.planet.firstColor;
            ctx.fillRect(-w, y, 2 * w + 1, 1);

            if (y % entity.planet.stripeSpacing == 0) {
                ctx.fillStyle = entity.planet.secondColor;
                ctx.fillRect(-w, y, random() * 2 * w, 1);
            }
        }

        ctx.restore();
    }

    // Draw particles
    for (let entity of entities.filter(e => e.particle)) {
        ctx.save();
        ctx.globalAlpha = 1 - entity.age / entity.lifetime;
        ctx.fillStyle = entity.particle.color;
        ctx.fillRect(entity.position.x, entity.position.y, entity.particle.size, entity.particle.size);
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
            ctx.fillStyle = "#f00";
            ctx.fillRect(entity.position.x, entity.position.y, 1, 1);
        }

        // Collision radius
        for (let entity of entities.filter(e => e.collision)) {
            ctx.strokeStyle = "#00f";
            ctx.beginPath();
            ctx.arc(entity.position.x, entity.position.y, entity.collision.radius, 0, 2 * Math.PI);
            ctx.stroke();
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
            ctx.strokeStyle = "#00f";
            ctx.beginPath();
            ctx.arc(entity.position.x, entity.position.y, entity.planet.radius, 0, 2 * Math.PI);
            ctx.stroke();
        }

        ctx.restore();
    }

    ctx.restore();

    // Draw hud
    ctx.fillStyle = colors[15];
    const unit = canvas.width / 48;

    // Draw arrow in direction of joeys
    for (let entity of entities.filter(e => e.sprite?.imageId === "joey")) {
        const between = Vec.subtract(entity.position, camera.position);
        const distance = Vec.length(between);
        const scale = 40 / distance + 1;

        ctx.save();

        ctx.globalAlpha = Math.max(0, Math.min(1, (distance - 60) / 10));
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Vec.angle(between));
        ctx.translate(10 * unit, 0);
        ctx.scale(scale, scale);

        ctx.beginPath();
        ctx.moveTo(0, -unit);
        ctx.lineTo(unit, 0);
        ctx.lineTo(0, unit);
        ctx.fill();

        ctx.restore();
    }

    // Draw player momentum bar
    ctx.fillRect(0, 0, canvas.width * player.wallaby.momentum, unit);

    requestAnimationFrame(draw);
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

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
    const unit = 32;
    const size = Math.min(Math.floor(Math.min(window.innerWidth, window.innerHeight) / unit), 24);
    canvas.width = canvas.height = size * unit;
    canvas.style.left = `${(window.innerWidth - canvas.width) / 2}px`;
    canvas.style.top = `${(window.innerHeight - canvas.height) / 2}px`;
    ctx.imageSmoothingEnabled = false;
};
window.addEventListener("resize", resize);

resize();
draw();