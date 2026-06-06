const DIRECTIONS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
const DIRECTION_ANGLES = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: 225, S: 270, SE: 315 };
const DEFAULT_SPECIES = ['Blue Raptor', 'T-Rex', 'Triceratops'];
const DINO_BILLBOARD_FOLLOW_FACTOR = 0.7;
const DINO_MAX_SIDE_ANGLE = Math.PI * 65 / 180;
const DINO_BILLBOARD_EPSILON = 0.000001;

function anim(folder, fps = 8) {
    return { folder, prefix: folder, fps, start: 1, end: 29, step: 2, pad: 3, extension: 'png' };
}

function raptorAnim(name, fps = 8) {
    return anim(`Raptor ${name}`, fps);
}

const DINO_MANIFEST = {
    'Blue Raptor': { kind: 'predator', animations: { idle: raptorAnim('Idle', 7), walk: raptorAnim('Walk', 10), run: raptorAnim('run', 13), taunt: raptorAnim('Shout', 8) } },
    'Green Raptor': { kind: 'predator', animations: { idle: raptorAnim('Idle', 7), walk: raptorAnim('Walk', 10), run: raptorAnim('run', 13), taunt: raptorAnim('Shout', 8) } },
    'Red Raptor': { kind: 'predator', animations: { idle: raptorAnim('Idle', 7), walk: raptorAnim('Walk', 10), run: raptorAnim('run', 13), taunt: raptorAnim('Shout', 8) } },
    'Velociraptor': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 10), run: anim('Run', 13), taunt: anim('Taunt', 8) } },
    'T-Rex': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 11), taunt: anim('Taunt', 8) } },
    'Triceratops': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'Stegosaurus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 9), taunt: anim('Taunt', 8) } },
    'Gallimimus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 10), run: anim('Run', 13), taunt: anim('Taunt', 8) } },
    'Parasaurolophus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'Dilophosaurus': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 11), taunt: anim('Taunt', 8) } },
    'Crocodile': { kind: 'reptile', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'ELITE T-Rex': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 11), taunt: anim('Taunt', 8) } },
    'ELITE Triceratops': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'ELITE Stegosaurus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 9), taunt: anim('Taunt', 8) } },
    'ELITE Brachiosaurus': { kind: 'herbivore', animations: { idle: anim('Idle', 6), walk: anim('Walk', 7), run: anim('Walk', 7), taunt: anim('Taunt', 7) } }
};

function makeRandom(seed) {
    let state = Number(seed) >>> 0;
    return function random() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomRange(random, min, max) {
    return min + random() * (max - min);
}

function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function randomUnitVector(THREE, random) {
    const z = randomRange(random, -0.88, 0.88);
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - z * z);
    return new THREE.Vector3(Math.cos(angle) * radius, z, Math.sin(angle) * radius).normalize();
}

function tangentFromNormal(THREE, normal, random) {
    const helper = Math.abs(normal.y) > 0.86 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(helper, normal).normalize();
    tangent.applyAxisAngle(normal, random() * Math.PI * 2).normalize();
    return tangent;
}

function frameList(config, direction) {
    const angle = DIRECTION_ANGLES[direction] ?? 0;
    const files = [];
    for (let frame = config.start; frame <= config.end; frame += config.step) {
        files.push(`${config.prefix}_${angle}_${String(frame).padStart(config.pad, '0')}.${config.extension}`);
    }
    return files;
}

class SpriteAnimationController {
    constructor(system, species, material) {
        this.system = system;
        this.species = species;
        this.material = material;
        this.animation = 'idle';
        this.direction = 'S';
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.fps = 8;
        this.frames = [];
        this.setAnimation('idle', 'S');
    }

    setAnimation(animation, direction = this.direction) {
        const resolved = this.system.resolveAnimation(this.species, animation);
        this.animation = resolved.animation;
        this.direction = this.system.resolveDirection(this.species, resolved.animation, direction);
        this.frames = this.system.getFrames(this.species, this.animation, this.direction);
        this.fps = resolved.config.fps || 8;
        this.frameIndex = Math.min(this.frameIndex, Math.max(0, this.frames.length - 1));
        this.applyFrame();
    }

    update(deltaTime, direction) {
        if (direction !== this.direction) this.setAnimation(this.animation, direction);
        if (!this.frames.length) return;
        this.frameTimer += deltaTime;
        const frameDuration = 1 / this.fps;
        if (this.frameTimer < frameDuration) return;
        this.frameTimer %= frameDuration;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        this.applyFrame();
    }

    applyFrame() {
        if (!this.frames.length) return;
        const texture = this.system.loadTexture(this.frames[this.frameIndex]);
        if (texture) this.material.map = texture;
        this.material.needsUpdate = true;
    }
}

export class DinoLifeSystem {
    constructor(options) {
        this.THREE = options.THREE;
        this.camera = options.camera;
        this.parentGroup = options.parentGroup || options.scene;
        this.getPlanetRadius = options.getPlanetRadius || (() => 1);
        this.getPlanetCenter = options.getPlanetCenter || (() => new this.THREE.Vector3());
        this.getPlanetMesh = options.getPlanetMesh || (() => null);
        this.getPlanetSurfaceHeight = options.getPlanetSurfaceHeight || (() => 0);
        this.spriteBasePath = options.spriteBasePath || './sprites/';
        this.settings = options.settings || {};
        this.textureLoader = new this.THREE.TextureLoader();
        this.textureCache = new Map();
        this.warned = new Set();
        this.group = new this.THREE.Group();
        this.group.name = 'DinoLifeSystem';
        this.parentGroup.add(this.group);
        this.population = [];
        this.planetInfo = { radius: 1, seed: 1, profile: null, planetMesh: null };
        this.tmpCenter = new this.THREE.Vector3();
        this.tmpWorldCenter = new this.THREE.Vector3();
        this.tmpWorldPosition = new this.THREE.Vector3();
        this.tmpWorldNormal = new this.THREE.Vector3();
        this.tmpCameraWorld = new this.THREE.Vector3();
        this.tmpLocalCamera = new this.THREE.Vector3();
        this.tmpLocalTangent = new this.THREE.Vector3();
        this.tmpInverseQuaternion = new this.THREE.Quaternion();
        this.surfaceUp = new this.THREE.Vector3(0, 1, 0);
        this.maxActive = 80;
        this.activeCount = 0;
        this.interactiveDinoObjects = [];
        this.dinoObjectMap = new Map();
    }

    setPlanetInfo(info) {
        this.planetInfo = { ...this.planetInfo, ...info };
    }

    updateSettings(settings) {
        this.settings = settings || this.settings;
        this.maxActive = Math.min(120, Math.max(1, Math.floor(this.settings.dinoMaxActive || this.maxActive || 80)));
    }

    clearPopulation() {
        this.population.length = 0;
        this.interactiveDinoObjects.length = 0;
        this.dinoObjectMap.clear();
        while (this.group.children.length) {
            const child = this.group.children[0];
            const geometries = new Set();
            const materials = new Set();
            this.group.remove(child);
            child.traverse((node) => {
                if (node.geometry) geometries.add(node.geometry);
                if (Array.isArray(node.material)) {
                    node.material.forEach((material) => materials.add(material));
                } else if (node.material) {
                    materials.add(node.material);
                }
            });
            geometries.forEach((geometry) => geometry.dispose());
            materials.forEach((material) => material.dispose());
        }
    }

    regeneratePopulation() {
        this.clearPopulation();
        if (!this.shouldRunForPlanet()) return;
        const random = makeRandom((this.planetInfo.seed || 1) + 70177);
        const speciesList = this.getSelectedSpecies();
        this.maxActive = Math.min(120, Math.max(1, Math.floor(this.settings.dinoMaxActive || this.maxActive || 80)));
        const count = Math.min(120, Math.max(0, Math.floor(this.settings.dinoCount || 0)));
        for (let i = 0; i < count; i++) {
            const species = speciesList[Math.floor(random() * speciesList.length)] || DEFAULT_SPECIES[0];
            if (!DINO_MANIFEST[species]) continue;
            this.population.push(this.createDino(species, random, i));
        }
    }

    shouldRunForPlanet() {
        if (!this.settings.lifeEnabled) return false;
        const profileType = this.planetInfo.profile?.type;
        return !['star', 'blackhole', 'gas'].includes(profileType);
    }

    getSelectedSpecies() {
        const selected = Array.isArray(this.settings.dinoSpecies) ? this.settings.dinoSpecies : DEFAULT_SPECIES;
        const available = selected.filter((name) => DINO_MANIFEST[name]);
        return available.length ? available : DEFAULT_SPECIES;
    }

    createDino(species, random, index) {
        const THREE = this.THREE;
        const normal = randomUnitVector(THREE, random);
        const tangent = tangentFromNormal(THREE, normal, random);
        const scale = this.getSpeciesScale(species) * (this.settings.dinoScale || 1);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            alphaTest: 0.12,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale * 0.8, scale), material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        const hitArea = new THREE.Mesh(
            new THREE.SphereGeometry(scale * 0.64, 10, 8),
            new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                colorWrite: false,
                depthWrite: false
            })
        );
        hitArea.name = 'DinoInteractionHitArea';
        hitArea.frustumCulled = false;
        hitArea.renderOrder = -1;
        const group = new THREE.Group();
        group.frustumCulled = false;
        group.add(mesh);
        group.add(hitArea);
        group.visible = false;
        this.group.add(group);

        const speedScale = Math.max(1, this.getRadius());
        const dino = {
            index,
            species,
            kind: DINO_MANIFEST[species].kind,
            normal,
            tangent,
            mesh,
            hitArea,
            group,
            material,
            animation: new SpriteAnimationController(this, species, material),
            lastValidBillboardYaw: null,
            lastValidCameraYaw: null,
            state: random() > 0.72 ? 'idle' : 'walk',
            stateTimer: randomRange(random, 1.0, 6.0),
            turnTimer: randomRange(random, 0.8, 4.5),
            speed: randomRange(random, 0.006, 0.018) * speedScale * (this.settings.dinoMoveSpeed || 1) * (DINO_MANIFEST[species].kind === 'predator' ? 1.25 : 0.82),
            random
        };
        mesh.userData.dinoLifeDino = dino;
        hitArea.userData.dinoLifeDino = dino;
        group.userData.dinoLifeDino = dino;
        this.dinoObjectMap.set(mesh.uuid, dino);
        this.dinoObjectMap.set(hitArea.uuid, dino);
        this.dinoObjectMap.set(group.uuid, dino);
        this.placeDino(dino);
        return dino;
    }

    getSpeciesScale(species) {
        if (species.includes('Brachiosaurus')) return 0.65;
        if (species.includes('T-Rex')) return 0.48;
        if (species.includes('Triceratops') || species.includes('Stegosaurus')) return 0.38;
        if (species.includes('Crocodile')) return 0.24;
        return 0.3;
    }

    placeDino(dino) {
        const THREE = this.THREE;
        const center = this.getCenter();
        const radius = this.getRadius();
        const scale = this.getSpeciesScale(dino.species) * (this.settings.dinoScale || 1);
        const up = dino.normal;
        const surfaceHeight = this.getSurfaceHeight(up);
        const groundOffset = this.getGroundOffset(scale, radius);
        const pos = new THREE.Vector3().copy(center).addScaledVector(up, radius + surfaceHeight + groundOffset);
        dino.group.position.copy(pos);
        dino.group.quaternion.setFromUnitVectors(this.surfaceUp, up);

        dino.mesh.position.set(0, scale * 0.5, 0);
        if (dino.hitArea) {
            dino.hitArea.position.set(0, scale * 0.5, 0);
            dino.hitArea.scale.setScalar(1 + Math.max(0, Number(this.settings.dinoScale || 1) - 1) * 0.12);
        }
        this.updateDinoBillboard(dino);
    }

    getCenter() {
        const center = this.getPlanetCenter();
        if (center?.isVector3) return center;
        return this.tmpCenter.set(0, 0, 0);
    }

    getRadius() {
        return Math.max(0.5, this.planetInfo.radius || this.getPlanetRadius() || 1);
    }

    getSurfaceHeight(normal) {
        const sampled = this.getPlanetSurfaceHeight(normal, this.planetInfo) || 0;
        return Number.isFinite(sampled) ? sampled : 0;
    }

    getGroundOffset(scale, radius) {
        const baseOffset = Math.max(0.02, Math.min(0.08, radius * 0.006, scale * 0.14));
        return baseOffset + Math.min(0.025, scale * 0.03);
    }

    getWorldCenter() {
        this.tmpWorldCenter.copy(this.getCenter());
        if (this.group.parent) {
            this.group.parent.updateWorldMatrix(true, false);
            this.group.parent.localToWorld(this.tmpWorldCenter);
        }
        return this.tmpWorldCenter;
    }

    getWorldNormal(dino) {
        this.tmpWorldNormal.copy(dino.normal);
        if (this.group.parent) {
            this.group.parent.updateWorldMatrix(true, false);
            this.tmpWorldNormal.transformDirection(this.group.parent.matrixWorld);
        }
        return this.tmpWorldNormal.normalize();
    }

    updateDinoBillboard(dino, camera = this.camera) {
        dino.group.updateWorldMatrix(true, false);
        camera.getWorldPosition(this.tmpCameraWorld);
        this.tmpLocalCamera.copy(this.tmpCameraWorld);
        dino.group.worldToLocal(this.tmpLocalCamera);

        const localCameraLengthSq = this.tmpLocalCamera.lengthSq();
        const hasCameraVector = localCameraLengthSq > DINO_BILLBOARD_EPSILON;
        const flatCameraLengthSq = this.tmpLocalCamera.x * this.tmpLocalCamera.x + this.tmpLocalCamera.z * this.tmpLocalCamera.z;
        const flatCameraRatioSq = hasCameraVector ? flatCameraLengthSq / localCameraLengthSq : 0;
        const hasFlatCameraVector = flatCameraRatioSq > DINO_BILLBOARD_EPSILON;

        this.tmpInverseQuaternion.copy(dino.group.quaternion).invert();
        this.tmpLocalTangent.copy(dino.tangent).applyQuaternion(this.tmpInverseQuaternion);
        this.tmpLocalTangent.y = 0;

        let tangentYaw = null;
        if (this.tmpLocalTangent.lengthSq() > DINO_BILLBOARD_EPSILON) {
            this.tmpLocalTangent.normalize();
            tangentYaw = Math.atan2(this.tmpLocalTangent.x, this.tmpLocalTangent.z);
        }

        const baseYaw = Number.isFinite(tangentYaw) ? tangentYaw : Number.isFinite(dino.lastValidBillboardYaw) ? dino.lastValidBillboardYaw : 0;
        let cameraYaw = dino.lastValidBillboardYaw;
        if (hasFlatCameraVector) {
            cameraYaw = Math.atan2(this.tmpLocalCamera.x, this.tmpLocalCamera.z);
            dino.lastValidCameraYaw = cameraYaw;
        } else if (!Number.isFinite(cameraYaw)) {
            cameraYaw = Number.isFinite(dino.lastValidCameraYaw) ? dino.lastValidCameraYaw : baseYaw;
        }

        if (dino.controlled) {
            dino.mesh.rotation.set(0, baseYaw, 0);
            dino.mesh.scale.set(1, 1, 1);
            dino.lastValidBillboardYaw = baseYaw;
            dino.lastValidCameraYaw = cameraYaw;
            return;
        }

        const pseudo3d = this.settings.dinoPseudo3dEnabled !== false;
        const followFactor = pseudo3d ? clampValue(Number(this.settings.dinoBillboardFollow ?? DINO_BILLBOARD_FOLLOW_FACTOR), 0, 1) : 1;
        const maxSideAngle = pseudo3d
            ? clampValue(Number(this.settings.dinoMaxSideAngle ?? 65), 25, 85) * Math.PI / 180
            : Math.PI * 0.5;
        const yawDiff = normalizeAngle(cameraYaw - baseYaw);
        let finalYaw = pseudo3d ? baseYaw + yawDiff * followFactor : cameraYaw;
        const finalDiffFromCamera = clampValue(normalizeAngle(finalYaw - cameraYaw), -maxSideAngle, maxSideAngle);
        finalYaw = cameraYaw + finalDiffFromCamera;

        dino.mesh.rotation.set(0, finalYaw, 0);
        dino.mesh.scale.set(1, 1, 1);
        dino.lastValidBillboardYaw = finalYaw;
    }

    updateBillboard(dino) {
        this.updateDinoBillboard(dino);
    }

    update(deltaTime) {
        if (!this.shouldRunForPlanet()) {
            this.group.visible = false;
            this.activeCount = 0;
            return;
        }
        this.group.visible = true;
        const center = this.getWorldCenter();
        const radius = this.getRadius();
        const cameraDistanceFromCenter = this.camera.position.distanceTo(center);
        const distanceCulling = this.settings.dinoDistanceCulling !== false;
        const renderDistance = distanceCulling ? (this.settings.dinoRenderDistance || radius * 5.5) : Number.POSITIVE_INFINITY;
        const animateDistance = this.settings.dinoAnimateDistance || radius * 3.5;
        const globalCullDistance = Math.max(radius * 2.6, renderDistance);
        if (cameraDistanceFromCenter > globalCullDistance + radius) {
            this.population.forEach((dino) => dino.group.visible = false);
            this.activeCount = 0;
            return;
        }

        let active = 0;
        for (const dino of this.population) {
            dino.group.getWorldPosition(this.tmpWorldPosition);
            const distance = this.tmpWorldPosition.distanceTo(this.camera.position);
            const controlled = Boolean(dino.controlled);
            const visible = controlled || (distance < renderDistance && active < this.maxActive);
            dino.group.visible = visible;
            if (!visible) continue;
            active++;
            if (controlled) {
                this.placeDino(dino);
                continue;
            }

            const animate = distance < animateDistance;
            this.updateBehavior(dino, deltaTime, animate);
            this.moveDino(dino, deltaTime);
            this.placeDino(dino);
            if (animate && this.settings.dinoAnimationEnabled !== false) {
                dino.animation.update(deltaTime, this.getSpriteDirection(dino));
            }
        }
        this.activeCount = active;
    }

    getInteractiveDinoObjects() {
        this.interactiveDinoObjects.length = 0;
        if (!this.shouldRunForPlanet() || !this.population.length) return this.interactiveDinoObjects;
        for (const dino of this.population) {
            if (!this.isDinoInteractive(dino)) continue;
            if (dino.hitArea) this.interactiveDinoObjects.push(dino.hitArea);
            this.interactiveDinoObjects.push(dino.mesh);
        }
        return this.interactiveDinoObjects;
    }

    isDinoInteractive(dino) {
        return Boolean(
            dino &&
            dino.group?.parent &&
            dino.mesh &&
            dino.group.visible &&
            dino.mesh.visible !== false
        );
    }

    getDinoFromObject(object) {
        let current = object;
        while (current) {
            const dino = this.dinoObjectMap.get(current.uuid) || current.userData?.dinoLifeDino;
            if (dino && this.population.includes(dino) && dino.group?.parent) return dino;
            current = current.parent;
        }
        return null;
    }

    setDinoControlled(dino, controlled) {
        if (!dino || !this.population.includes(dino) || !dino.group?.parent) return false;
        dino.controlled = Boolean(controlled);
        if (dino.controlled) {
            dino.controlRestoreState = {
                state: dino.state,
                stateTimer: dino.stateTimer,
                turnTimer: dino.turnTimer
            };
            dino.group.visible = true;
            dino.state = 'idle';
            dino.stateTimer = Number.POSITIVE_INFINITY;
            dino.turnTimer = Number.POSITIVE_INFINITY;
            dino.animation?.setAnimation?.('idle', this.getSpriteDirection(dino));
        } else {
            const restore = dino.controlRestoreState || {};
            dino.state = restore.state || dino.state || 'walk';
            dino.stateTimer = Number.isFinite(restore.stateTimer) ? Math.max(0.4, restore.stateTimer) : randomRange(dino.random || Math.random, 0.8, 2.2);
            dino.turnTimer = Number.isFinite(restore.turnTimer) ? Math.max(0.3, restore.turnTimer) : randomRange(dino.random || Math.random, 0.5, 1.8);
            dino.controlRestoreState = null;
            dino.animation?.setAnimation?.(dino.state === 'run' ? 'run' : dino.state === 'walk' ? 'walk' : 'idle', this.getSpriteDirection(dino));
        }
        return true;
    }

    updateBehavior(dino, deltaTime, animate) {
        dino.stateTimer -= deltaTime;
        dino.turnTimer -= deltaTime;
        if (dino.turnTimer <= 0) {
            dino.tangent.applyAxisAngle(dino.normal, randomRange(dino.random, -0.85, 0.85)).normalize();
            dino.turnTimer = randomRange(dino.random, 1.0, 5.5);
        }
        if (dino.stateTimer <= 0) {
            const roll = dino.random();
            dino.state = roll > 0.78 ? 'idle' : roll > 0.62 && dino.kind === 'predator' ? 'run' : 'walk';
            dino.stateTimer = randomRange(dino.random, 1.4, 6.0);
            const animName = dino.state === 'run' ? 'run' : dino.state === 'walk' ? 'walk' : 'idle';
            dino.animation.setAnimation(animName, this.getSpriteDirection(dino));
        }
        if (!animate && dino.state !== 'walk') {
            dino.state = 'walk';
            dino.animation.setAnimation('walk', this.getSpriteDirection(dino));
        }
    }

    moveDino(dino, deltaTime) {
        if (dino.state === 'idle') return;
        const speedMul = dino.state === 'run' ? 2.0 : 1.0;
        const radius = this.getRadius();
        const angularStep = (dino.speed * speedMul * deltaTime) / Math.max(0.5, radius);
        dino.normal.addScaledVector(dino.tangent, angularStep).normalize();
        dino.tangent.addScaledVector(dino.normal, -dino.tangent.dot(dino.normal)).normalize();
    }

    getSpriteDirection(dino) {
        if (this.settings.dinoPseudo3dEnabled === false) return 'S';
        dino.group.getWorldPosition(this.tmpWorldPosition);
        const normal = this.getWorldNormal(dino).clone();
        const toCamera = this.camera.position.clone().sub(this.tmpWorldPosition).normalize();
        const right = new this.THREE.Vector3().crossVectors(normal, toCamera);
        if (right.lengthSq() < 0.000001) return dino.animation.direction || 'S';
        right.normalize();
        const forward = new this.THREE.Vector3().crossVectors(right, normal).normalize();
        const tangent = dino.tangent.clone();
        if (this.group.parent) tangent.transformDirection(this.group.parent.matrixWorld);
        const x = tangent.dot(right);
        const y = tangent.dot(forward);
        const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        let index = Math.round(angle / 45) % 8;
        if (dino.controlled) index = (index + 4) % 8;
        return DIRECTIONS[index];
    }

    resolveAnimation(species, animation) {
        const manifest = DINO_MANIFEST[species];
        const candidate = manifest.animations[animation] ? animation : manifest.animations.walk ? 'walk' : 'idle';
        return { animation: candidate, config: manifest.animations[candidate] };
    }

    resolveDirection(species, animation, direction) {
        if (DIRECTIONS.includes(direction)) return direction;
        return 'S';
    }

    getFrames(species, animation, direction) {
        const config = DINO_MANIFEST[species].animations[animation];
        const files = frameList(config, direction);
        return files.map((file) => encodeURI(`${this.spriteBasePath}${species}/${config.folder}/${direction}/${file}`));
    }

    loadTexture(url) {
        if (this.textureCache.has(url)) return this.textureCache.get(url);
        const texture = this.textureLoader.load(
            url,
            (loaded) => {
                loaded.minFilter = this.THREE.LinearFilter;
                loaded.magFilter = this.settings.dinoSpriteQuality === 'low' ? this.THREE.NearestFilter : this.THREE.LinearFilter;
                loaded.generateMipmaps = false;
                loaded.needsUpdate = true;
            },
            undefined,
            () => {
                if (!this.warned.has(url)) {
                    console.warn(`Sprite nao encontrada: ${url}`);
                    this.warned.add(url);
                }
            }
        );
        texture.minFilter = this.THREE.LinearFilter;
        texture.magFilter = this.settings.dinoSpriteQuality === 'low' ? this.THREE.NearestFilter : this.THREE.LinearFilter;
        this.textureCache.set(url, texture);
        return texture;
    }

    dispose() {
        this.clearPopulation();
        this.textureCache.forEach((texture) => texture.dispose());
        this.textureCache.clear();
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}

export { DINO_MANIFEST };
