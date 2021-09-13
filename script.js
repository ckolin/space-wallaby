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
    pause: false,
    gameOver: false
};

// URBEX 16 palette by Rustocrat (https://lospec.com/palette-list/urbex-16)
const colors = [
    "#cbd1be", "#8f9389", "#52534c", "#26201d",
    "#e0a46e", "#91a47a", "#5d7643", "#4d533a",
    "#a93130", "#7a1338", "#834664", "#917692",
    "#160712", "#593084", "#3870be", "#579fb4"
];

// Text drawing
// Font is m3x6 by Daniel Linssen
const alphabet = "naobpcdresftguhvijkxlyz0123456789: ";
const fontImage = document.getElementById("font");
const drawWord = (word) => {
    let x = 0;
    const w = 3;
    const h = fontImage.naturalHeight;
    word
        .toLowerCase()
        .split("")
        .forEach(c => {
            const i = alphabet.indexOf(c);
            if (i === -1) { // HACK: Enable chaining characters ("N..N" looks like "M" for example)
                x--;
            } else {
                ctx.drawImage(fontImage, i * w, 0, w, h, x, 0, w, h);
                x += w + 1;
            }
        });
};

// Seeded random number generator
const seed = Date.now();
const seededRandom = s => () => (2 ** 31 - 1 & (s = Math.imul(48271, s + seed))) / 2 ** 31;

// World settings that affect gameplay
const world = {
    baseJoeyDistance: 200,
    randomJoeyDistance: 100,
    cageChance: 0,
    baseButtonDistance: 50,
    randomButtonDistance: 10,
    planetChance: 0.4,
    basePlanetRadius: 3,
    randomPlanetRadius: 6,
    basePlanetRotationalVelocity: 1,
    randomPlanetRotationalVelocity: 3,
    spaceshipChance: 0.001,
    baseSpaceshipSpeed: 6,
    randomSpaceshipSpeed: 4,
    baseSpaceshipRotationSpeed: 0.1,
    randomSpaceshipRotationSpeed: 1,
    spaceshipIdleTime: 5000
};

// Chunk system for procedural generation
chunkSize = 42;
const getChunk = position => {
    const chunk = Vec.floor(Vec.scale(position, 1 / chunkSize));
    chunk.id = chunk.y * 1e9 + chunk.x;
    return chunk;
};
let chunks = [];

// Things that need to be generated in a certain chunk
const specials = {
    0: {
        planet: false,
        spaceship: false
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

const player = {
    sprite: {
        imageId: "wallaby",
        scale: 0.5
    },
    wallaby: {
        charge: 0,
        jumpSpeed: 40,
        boostSpeed: 120,
        attachedChargeFactor: 0.4,
        floatingChargeFactor: 0.1,
        boostingChargeFactor: -1,
        score: 0,
        lives: 2
    },
    keep: true,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    damping: 0.1,
    rotation: 0,
    rotationalVelocity: 0,
    gravity: 2,
    collision: {
        radius: 6,
        attach: true
    }
};

let entities = [
    camera,
    player
];

const angleDifference = (a, b) => {
    const res = a - b;
    if (res > Math.PI) {
        return res - 2 * Math.PI;
    } else if (res <= -Math.PI) {
        return res + 2 * Math.PI;
    } else {
        return res;
    }
};

let lastUpdate = performance.now();
const update = () => {
    const now = performance.now();
    const deltaMs = now - lastUpdate;
    const delta = deltaMs / 1000;
    lastUpdate = now;

    if (input.pause || input.gameOver) {
        return;
    }

    // Spawn joey if none exists
    if (!entities.some(e => e.sprite?.imageId === "joey")) {
        // Choose chunk to spawn joey in
        const distance = player.wallaby.score === 0 ? chunkSize * 2
            : Math.random() * world.randomJoeyDistance + world.baseJoeyDistance;
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
            position: Vec.scale(chunk, chunkSize),
            velocity: { x: 0, y: 0 },
            rotation: 0,
            rotationalVelocity: 0,
            collision: {
                radius: 4,
                attach: true
            }
        });

        // Add cage
        if (Math.random() < world.cageChance) {
            // Choose chunk to generate button in
            const buttonChunk = getChunk(Vec.add(
                Vec.scale(Vec.add(chunk, { x: 0.5, y: 0.5 }), chunkSize),
                Vec.rotate(
                    { x: Math.random() * world.randomButtonDistance + world.baseButtonDistance, y: 0 },
                    Math.random() * 2 * Math.PI
                )
            ));

            specials[chunk.id].cage = true;

            specials[buttonChunk.id] = {
                button: chunk.id, // Store chunk of cage
                planet: true
            };
        }
    }

    // Find active chunks
    const previousChunks = chunks;
    chunks = [];
    const screenHalf = Vec.scale({ x: 1, y: 1 }, camera.view.size / 2);
    const start = Vec.subtract(camera.position, screenHalf);
    const end = Vec.add(camera.position, screenHalf);
    const overscan = chunkSize;
    for (let x = start.x - overscan; x <= end.x + overscan; x += chunkSize) {
        for (let y = start.y - overscan; y <= end.y + overscan; y += chunkSize) {
            chunks.push(getChunk({ x, y }));
        }
    }

    // Generate new chunks
    const newChunks = chunks.filter(c => !previousChunks.some(p => p.id === c.id));
    for (let chunk of newChunks) {
        const random = seededRandom(chunk.id);
        const chunkOrigin = Vec.scale(chunk, chunkSize);
        const special = specials[chunk.id];

        // Create stars
        if (special?.stars == null ? true : special.stars) {
            const numStars = Math.ceil(random() * 3);
            for (let i = 0; i < numStars; i++) {
                entities.push({
                    star: {
                        size: random() + 0.5,
                        color: colors[Math.floor(random() * 2 + 1)]
                    },
                    chunkId: chunk.id,
                    position: Vec.add(chunkOrigin, Vec.scale({ x: random(), y: random() }, chunkSize))
                });
            }
        }

        // Create planet
        if (special?.planet == null ? random() < world.planetChance : special.planet) {
            const position = Vec.floor(
                Vec.add(
                    chunkOrigin,
                    Vec.scale({ x: random() * 0.4, y: random() * 0.4 }, chunkSize)
                )
            );
            const startColors = [1, 2, 5, 6, 8, 9, 10, 13, 14];
            const startColor = startColors[Math.floor(random() * startColors.length)];
            const swap = random() < 0.5;

            planet = {
                planet: {
                    radius: Math.ceil(random() * world.randomPlanetRadius + world.basePlanetRadius),
                    stripeSpacing: Math.ceil(random() * 3),
                    firstColor: colors[swap ? startColor + 1 : startColor],
                    secondColor: colors[swap ? startColor : startColor + 1]
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
                rotationalVelocity: (random() * world.randomPlanetRotationalVelocity + world.basePlanetRotationalVelocity)
                    * (random() < 0.5 ? 1 : -1)
            };
            entities.push(planet);

            if (special?.joey) {
                // Make sure joey gets attached to planet
                const joey = entities.find(e => e.sprite?.imageId === "joey" && e.chunkId === chunk.id);
                joey.rotation = 0;
                joey.position = Vec.add(planet.position, { x: 0, y: -1 });

                // Put joey in cage >:-)
                if (special?.cage) {
                    entities.push({
                        sprite: {
                            imageId: "cage",
                            scale: 0.5
                        },
                        chunkId: chunk.id,
                        position: joey.position,
                        velocity: { x: 0, y: 0 },
                        rotation: joey.rotation,
                        rotationalVelocity: 0,
                        collision: {
                            radius: 4,
                            attach: true
                        }
                    });
                }
            }

            if (special?.button) {
                entities.push({
                    button: {
                        cageChunkId: special.button
                    },
                    sprite: {
                        imageId: "button",
                        scale: 0.8
                    },
                    chunkId: chunk.id,
                    position: Vec.add(planet.position, { x: 0, y: -1 }),
                    velocity: { x: 0, y: 0 },
                    rotation: 0,
                    rotationalVelocity: 0,
                    collision: {
                        radius: 2,
                        attach: true
                    }
                });
            }
        }

        // Create spaceship
        if (special?.spaceship == null ? Math.random() < world.spaceshipChance : special.spaceship) {
            entities.push({
                spaceship: {
                    speed: Math.random() * world.randomSpaceshipSpeed + world.baseSpaceshipSpeed,
                    rotationSpeed: Math.random() * world.randomSpaceshipRotationSpeed + world.baseSpaceshipRotationSpeed,
                    state: "boost",
                    since: 0
                },
                sprite: {
                    imageId: "spaceship",
                    scale: 0.75
                },
                position: chunkOrigin,
                velocity: { x: 0, y: 0 },
                damping: 0.4,
                rotation: Math.random() * 2 * Math.PI,
                rotationalVelocity: 0,
                rotationalDamping: 0.4,
                collision: {
                    radius: 6,
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

    // Player rotation
    if (!player.attachedTo) {
        let force = { x: 0, y: 0 };
        for (let planet of entities.filter(e => e.planet)) {
            const between = Vec.subtract(planet.position, player.position)
            force = Vec.add(force, Vec.scale(between, 1 / Vec.length(between) ** 4));
        }

        player.rotation = Vec.angle(force) - 0.5 * Math.PI;
    }

    // Player jumping and boosting
    if (input.action) {
        if (player.attachedTo) {
            zzfx(...[.2, , 200, .05, .01, .18, 2, 1.03, 8.9, , , , , .3, , .1, , .79, .04]);

            const direction = Vec.normalize(Vec.scale(Vec.subtract(player.attachedTo.position, player.position), -1));
            player.position = Vec.add(player.position, direction); // Move out of collision
            player.velocity = Vec.rotate(
                Vec.scale(direction, player.wallaby.jumpSpeed),
                player.attachedTo.rotationalVelocity * delta
            );

            // Remove attachment
            player.attachedTo = null;
        } else if (player.wallaby.charge > 0) {
            zzfx(...[.05, 0, 1e3, , , .01, , 0, , , , , , 1e3, , .3]);

            player.wallaby.charge += player.wallaby.boostingChargeFactor * delta;
            const downward = Vec.rotate({ x: 0, y: -1 }, player.rotation);
            player.velocity = Vec.add(player.velocity, Vec.scale(downward, player.wallaby.boostSpeed * delta));

            // Spawn particles
            for (let i = 0; i < deltaMs / 6; i++) {
                entities.push({
                    particle: {
                        color: colors[0],
                        size: Math.random() + 0.5
                    },
                    age: 0,
                    lifetime: Math.random() * 500 + 400,
                    position: player.position,
                    velocity: Vec.scale(Vec.rotate(downward, (Math.random() - 0.5) * 2), -(Math.random() * 10 + 10)),
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

    // Player charge
    if (player.attachedTo) {
        player.wallaby.charge += player.wallaby.attachedChargeFactor * delta;
    } else {
        player.wallaby.charge += player.wallaby.floatingChargeFactor * delta;
    }
    player.wallaby.charge = Math.max(0, Math.min(1, player.wallaby.charge));

    // Spaceship logic
    for (let entity of entities.filter(e => e.spaceship)) {
        entity.spaceship.since += deltaMs;
        const forward = Vec.rotate({ x: 1, y: 0 }, entity.rotation);
        const volume = Math.min(1, 10 / Vec.distance(player.position, entity.position));
        let newState;

        switch (entity.spaceship.state) {
            case "idle":
                if (entity.spaceship.since > world.spaceshipIdleTime) {
                    newState = Math.random() < 0.4 ? "boost" : "rotate";
                }
                break;
            case "rotate":
                let angle = angleDifference(
                    Vec.angle(Vec.subtract(player.position, entity.position)),
                    entity.rotation
                );
                entity.rotationalVelocity += angle * entity.spaceship.rotationSpeed * delta;

                if (entity.spaceship.since > 1000) {
                    newState = Math.random() < 0.3 ? "boost" : "shoot";
                }
                break;
            case "boost":
                zzfx(...[.05 * volume, 0, 1e6, , , .01, , 0, , , , , , 1e3, , .3]);
                entity.velocity = Vec.add(
                    entity.velocity,
                    Vec.scale(forward, entity.spaceship.speed * delta)
                );

                // Spawn particles
                const offset = { x: -3, y: 7 };
                const start = Math.round(Math.random());
                const right = Vec.rotate(offset, entity.rotation);
                const left = Vec.rotate(Vec.multiply(offset, { x: 1, y: -1 }), entity.rotation);
                for (let i = 0; i < deltaMs / 8; i++) {
                    entities.push({
                        particle: {
                            color: colors[0],
                            size: Math.random() + 0.5
                        },
                        age: 0,
                        lifetime: Math.random() * 200 + 100,
                        position: Vec.add(entity.position, i % 2 === start ? right : left),
                        velocity: Vec.scale(Vec.rotate(forward, Math.random() - 0.5), -(Math.random() * 10 + 20)),
                        collision: {
                            radius: 1
                        }
                    });
                }

                if (entity.spaceship.since > 2000) {
                    newState = Math.random() < 0.7 ? "idle" : "shoot";
                }
                break;
            case "shoot":
                zzfx(...[volume, , 465, , .06, .03, 3, 1.37, -7.8, , , , .09, , , .1, .06, .92, .01, .43]);

                entities.push({
                    sprite: {
                        imageId: "laser",
                        scale: 0.75
                    },
                    position: Vec.add(entity.position, Vec.scale(forward, 6)),
                    velocity: Vec.scale(forward, 10),
                    rotation: entity.rotation,
                    rotationalVelocity: 0,
                    collision: {
                        radius: 1,
                        destroy: true
                    }
                });

                newState = "idle";
                break;
        }

        if (newState) {
            entity.spaceship.since = 0;
            entity.spaceship.state = newState;
        }
    }

    // Gravity
    for (let entity of entities.filter(e => e.gravity && !e.attachedTo)) {
        let force = { x: 0, y: 0 };

        for (let planet of entities.filter(e => e.planet)) {
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
        for (let planet of entities.filter(e => e.planet)) {
            const between = Vec.subtract(planet.position, entity.position);
            const collisionDistance = planet.planet.radius + entity.collision.radius;

            if (Vec.length(between) > collisionDistance) {
                continue; // Too far away
            }

            if (entity.collision.attach) {
                if (entity === player) {
                    // Stop player from jumping again
                    input.action = false;

                    // Set rotation
                    entity.rotation = Vec.angle(between) - 0.5 * Math.PI;
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
            } else if (entity.collision.destroy) {
                entity.destroy = true;
            } else {
                // Resolve normal collision
                const normal = Vec.normalize(between);
                const rel = Vec.subtract(entity.velocity, planet.velocity);

                if (Vec.dot(rel, normal) < 0) {
                    continue; // Entities are alrady moving apart
                }

                const tangent = Vec.normalize(
                    Vec.multiply(
                        Vec.flip(between),
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

    // Player collision
    for (let entity of entities.filter(e => e.collision)) {
        const distance = Vec.distance(entity.position, player.position);
        if (distance > entity.collision.radius + player.collision.radius) {
            continue; // Too far away
        }

        if (entity.sprite?.imageId === "joey") {
            if (specials[entity.chunkId]?.cage) {
                continue; // Joey is still in cage
            }

            zzfx(...[1.93, , 342, , .01, .23, , 1.28, , , 98, .09, , .1, , , .08, .72, .04]);
            player.wallaby.score++;

            // Increase difficulty
            world.baseJoeyDistance += 20;
            world.cageChance = Math.min(0.9, world.cageChance + 0.05);
            world.basePlanetRotationalVelocity += 0.5;
            world.spaceshipChance *= 1.5;
            world.spaceshipIdleTime *= 0.8;

            // Remove joey
            entity.destroy = true;
            delete specials[entity.chunkId].joey;
        } else if (entity.button) {
            zzfx(...[2.1, , 1928, .01, .03, .04, 2, 2.54, 6.1, -65, , , .01, , , , .11, .09, .05, .61]);

            // Remove cage if it exists
            const cage = entities.find(e => e.sprite?.imageId === "cage" && e.chunkId === entity.button.cageChunkId);
            if (cage) {
                cage.destroy = true;
            }
            delete specials[entity.button.cageChunkId].cage;

            // Make button pressed
            entity.sprite.imageId = "button_pressed";
            delete entity.button;
            delete specials[entity.chunkId].button;
        } else if (entity.sprite?.imageId === "laser") {
            zzfx(...[1.55, , 309, , .08, .18, 3, 1.6, -6.7, , , , , .3, , .1, .05, .69, .03]);

            player.wallaby.lives--;
            entity.destroy = true;
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

    // Game over
    if (player.wallaby.lives <= 0) {
        input.gameOver = true;
        for (let entity of entities.filter(e => !e.star && e !== camera)) {
            entity.destroy = true;
        }
    }

    entities
        .filter(e => !e.keep)
        .filter(e =>
            (e.chunkId && !chunks.some(c => c.id === e.chunkId)) // Remove entities belonging to inactive chunks
            || Vec.distance(e.position, camera.position) > camera.view.size * 2 // Remove entities too far out of view
            || (e.lifetime && e.age > e.lifetime)) // Remove entities with no lifetime left
        .forEach(e => e.destroy = true);

    // Remove entities marked to be destroyed
    entities = entities.filter(e => !e.destroy);

    // Remove attachments to destroyed entities
    for (let entity of entities.filter(e => e.attachedTo?.destroy)) {
        entity.attachedTo = null;
    }
};

const draw = () => {
    // Perform physics update
    update();

    // Draw background
    ctx.fillStyle = colors[12];
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
                ctx.fillRect(-w, y, Math.ceil(random() * 2 * w), 1);
            }
        }

        ctx.restore();
    }

    // Draw particles
    for (let entity of entities.filter(e => e.particle)) {
        ctx.save();
        ctx.globalAlpha = 1 - entity.age / entity.lifetime;
        ctx.fillStyle = entity.particle.color;
        const s = entity.particle.size;
        ctx.fillRect(entity.position.x - s / 2, entity.position.y - s / 2, s, s);
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
    ctx.fillStyle = colors[0];
    const unit = canvas.width / 48; // Used for ui element sizes

    if (input.gameOver) {
        ctx.save();
        ctx.scale(unit, unit);
        ctx.translate(0, 5);
        drawWord("  ...gan..ne over");
        ctx.translate(0, 15)
        drawWord("     ." + "000".concat(player.wallaby.score).substring(player.wallaby.score.toString().length));
        ctx.translate(0, 8);
        ctx.scale(0.5, 0.5);
        drawWord("      joeys rescued");
        ctx.translate(0, 25);
        ctx.globalAlpha = 0.5;
        drawWord("    tap to try again");
        ctx.restore();

        // Restart game
        if (input.action) {
            location.reload();
        }
    } else {
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

        // Draw player charge bar
        ctx.fillRect(0, 0, canvas.width * player.wallaby.charge, unit / 2);

        // Draw lives
        const heartImage = document.getElementById("heart");
        ctx.save();
        ctx.translate(canvas.width, canvas.height);
        ctx.scale(unit / 4, unit / 4);
        ctx.translate(-2, -8);
        for (let i = 1; i <= player.wallaby.lives; i++) {
            ctx.drawImage(heartImage, -i * (heartImage.naturalWidth + 1), 0);
        }
        ctx.restore();

        // Draw score
        ctx.save();
        ctx.translate(0, canvas.height);
        ctx.scale(unit / 4, unit / 4);
        ctx.translate(2, -8)
        drawWord("000".concat(player.wallaby.score).substring(player.wallaby.score.toString().length));
        ctx.restore();
    }

    requestAnimationFrame(draw);
};

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
});

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

    if (e.key === "Escape") {
        input.pause = !input.pause;
    } else {
        input.pause = false;
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