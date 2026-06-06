function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothFalloff(value) {
    const x = clamp(1 - value, 0, 1);
    return x * x * (3 - 2 * x);
}

function disposeNode(node) {
    if (!node) return;
    node.parent?.remove(node);
    const geometries = new Set();
    const materials = new Set();
    node.traverse((child) => {
        if (child.geometry) geometries.add(child.geometry);
        if (!child.material) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        childMaterials.forEach((material) => {
            if (material) materials.add(material);
        });
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
}

export class PlanetDamageSystem {
    constructor({ THREE, radius = 10 }) {
        this.THREE = THREE;
        this.radius = radius;
        this.mesh = null;
        this.group = null;
        this.basePositions = null;
        this.offsets = null;
        this.burn = null;
        this.heat = null;
        this.ice = null;
        this.structure = null;
        this.colors = null;
        this.undoStack = [];
        this.redoStack = [];
        this.decals = [];
        this.dirtyIndices = new Set();
        this.applyCount = 0;
        this.performance = {
            vertexStride: 1,
            normalEvery: 3
        };
    }

    configure(performance = {}) {
        const quality = performance.chaosQuality || performance.quality || 'medium';
        const byQuality = {
            low: { vertexStride: 3, normalEvery: 8 },
            medium: { vertexStride: 2, normalEvery: 5 },
            high: { vertexStride: 1, normalEvery: 3 },
            cinematic: { vertexStride: 1, normalEvery: 2 }
        };
        this.performance = { ...this.performance, ...(byQuality[quality] || byQuality.medium) };
    }

    setPlanet(mesh, group) {
        this.clearDecals();
        this.mesh = mesh?.isMesh ? mesh : null;
        this.group = group || null;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        if (!this.mesh?.geometry?.attributes?.position) {
            this.basePositions = null;
            return;
        }

        const position = this.mesh.geometry.attributes.position;
        const count = position.count;
        this.basePositions = new Float32Array(position.array);
        this.offsets = new Float32Array(count);
        this.burn = new Float32Array(count);
        this.heat = new Float32Array(count);
        this.ice = new Float32Array(count);
        this.structure = new Float32Array(count);
        this.colors = new Float32Array(count * 3);
        this.colors.fill(1);
        this.mesh.geometry.setAttribute('color', new this.THREE.BufferAttribute(this.colors, 3));

        const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
        materials.forEach((material) => {
            if (!material) return;
            material.vertexColors = true;
            material.needsUpdate = true;
        });
        this.applyBuffers({ force: true });
    }

    hasPlanet() {
        return Boolean(this.mesh && this.basePositions);
    }

    snapshot() {
        if (!this.hasPlanet()) return null;
        return {
            offsets: new Float32Array(this.offsets),
            burn: new Float32Array(this.burn),
            heat: new Float32Array(this.heat),
            ice: new Float32Array(this.ice),
            structure: new Float32Array(this.structure)
        };
    }

    restore(snapshot) {
        if (!snapshot || !this.hasPlanet()) return;
        this.offsets.set(snapshot.offsets);
        this.burn.set(snapshot.burn);
        this.heat.set(snapshot.heat);
        this.ice.set(snapshot.ice);
        if (snapshot.structure) this.structure.set(snapshot.structure);
        this.applyBuffers({ force: true });
    }

    pushUndo() {
        const snapshot = this.snapshot();
        if (!snapshot) return;
        this.undoStack.push(snapshot);
        if (this.undoStack.length > 32) this.undoStack.shift();
        this.redoStack.length = 0;
    }

    undo() {
        if (!this.undoStack.length || !this.hasPlanet()) return false;
        this.redoStack.push(this.snapshot());
        this.restore(this.undoStack.pop());
        return true;
    }

    redo() {
        if (!this.redoStack.length || !this.hasPlanet()) return false;
        this.undoStack.push(this.snapshot());
        this.restore(this.redoStack.pop());
        return true;
    }

    reset({ keepHistory = false } = {}) {
        if (!this.hasPlanet()) return;
        if (!keepHistory) this.pushUndo();
        this.offsets.fill(0);
        this.burn.fill(0);
        this.heat.fill(0);
        this.ice.fill(0);
        this.structure.fill(0);
        this.clearDecals();
        this.applyBuffers({ force: true });
    }

    worldToLocalNormal(worldPoint) {
        if (!this.hasPlanet()) return null;
        const localPoint = this.mesh.worldToLocal(worldPoint.clone());
        if (localPoint.lengthSq() < 0.000001) return null;
        return localPoint.normalize();
    }

    applyImpact(worldPoint, options = {}) {
        const normal = this.worldToLocalNormal(worldPoint);
        if (!normal) return;
        this.pushUndo();
        const impactScale = options.scale || 1;
        this.applyArea(normal, {
            mode: 'meteor',
            radius: options.radius || this.radius * 0.34,
            strength: options.strength || 0.7,
            heat: options.type === 'icy' ? 0.15 : 0.95,
            burn: options.type === 'icy' ? 0.18 : 0.8,
            ice: options.type === 'icy' ? 0.45 : 0,
            structure: 0.42 * impactScale,
            deform: (options.type === 'metallic' ? 1.15 : options.type === 'explosive' ? 1.55 : 1) * impactScale
        });
        this.createCraterDecal(normal, options.radius || this.radius * 0.34, options.type === 'icy');
    }

    applyLaser(worldPoint, options = {}) {
        const normal = this.worldToLocalNormal(worldPoint);
        if (!normal) return;
        this.applyArea(normal, {
            mode: 'laser',
            radius: options.radius || this.radius * 0.18,
            strength: options.strength || 0.35,
            heat: 0.62,
            burn: 0.42,
            structure: 0.22,
            deform: options.mode === 'cut' ? 1.25 : 0.8
        });
    }

    applyLaserTunnel(worldPoint, rayDirectionWorld, options = {}) {
        if (!this.hasPlanet()) return null;
        const THREE = this.THREE;
        const localEntry = this.mesh.worldToLocal(worldPoint.clone());
        const inverseWorld = this.mesh.matrixWorld.clone().invert();
        const localDirection = rayDirectionWorld.clone().transformDirection(inverseWorld).normalize();
        const shellRadius = Math.max(this.radius * 0.8, localEntry.length());
        const b = localEntry.dot(localDirection);
        const c = localEntry.lengthSq() - shellRadius * shellRadius;
        const discriminant = Math.max(0, b * b - c);
        const exitDistance = Math.max(this.radius * 0.35, -b + Math.sqrt(discriminant));
        const localExit = localEntry.clone().addScaledVector(localDirection, exitDistance);
        const exitWorld = this.mesh.localToWorld(localExit.clone());
        const tunnelRadius = options.radius || this.radius * 0.16;
        const strength = options.strength || 0.45;

        this.applySegmentDamage(localEntry, localExit, {
            radius: tunnelRadius,
            strength,
            mode: options.mode || 'pierce',
            heat: options.mode === 'annihilate' ? 1 : 0.76,
            burn: options.mode === 'annihilate' ? 0.74 : 0.5,
            structure: options.mode === 'annihilate' ? 0.78 : 0.36
        });

        this.createCraterDecal(localEntry.clone().normalize(), tunnelRadius * 1.5, false);
        this.createCraterDecal(localExit.clone().normalize(), tunnelRadius * 1.2, false);
        return { exitWorld, exitNormalWorld: exitWorld.clone().sub(this.mesh.getWorldPosition(new THREE.Vector3())).normalize() };
    }

    applyFreeze(worldPoint, options = {}) {
        const normal = this.worldToLocalNormal(worldPoint);
        if (!normal) return;
        this.pushUndo();
        this.applyArea(normal, {
            mode: 'freeze',
            radius: options.radius || this.radius * 0.32,
            strength: options.strength || 0.55,
            heat: -0.65,
            burn: -0.25,
            ice: 0.78,
            deform: 0.04
        });
    }

    applyRegeneration(worldPoint, options = {}) {
        const normal = this.worldToLocalNormal(worldPoint);
        if (!normal) return;
        this.pushUndo();
        this.applyArea(normal, {
            mode: 'regen',
            radius: options.radius || this.radius * 0.5,
            strength: options.strength || 0.8,
            heal: true
        });
    }

    applyArea(normal, effect) {
        if (!this.hasPlanet()) return;
        const angularRadius = Math.max(0.012, effect.radius / this.radius);
        const strength = effect.strength || 0.5;
        const base = this.basePositions;

        const stride = Math.max(1, Math.floor(this.performance.vertexStride || 1));
        for (let i = 0; i < this.offsets.length; i += stride) {
            const idx = i * 3;
            const vx = base[idx];
            const vy = base[idx + 1];
            const vz = base[idx + 2];
            const len = Math.hypot(vx, vy, vz) || 1;
            const dot = clamp((vx / len) * normal.x + (vy / len) * normal.y + (vz / len) * normal.z, -1, 1);
            const angularDistance = Math.acos(dot);
            if (angularDistance > angularRadius) continue;
            const local = angularDistance / angularRadius;
            const influence = smoothFalloff(local) * strength;

            if (effect.heal) {
                const heal = influence * 0.95;
                this.offsets[i] *= 1 - heal;
                this.burn[i] = Math.max(0, this.burn[i] - heal);
                this.heat[i] = Math.max(0, this.heat[i] - heal);
                this.ice[i] = Math.max(0, this.ice[i] - heal);
                this.structure[i] = Math.max(0, this.structure[i] - heal);
                continue;
            }

            if (effect.mode === 'meteor') {
                const bowl = -1.05 * influence * (1 - local * local);
                const rim = local > 0.52 && local < 0.94 ? 0.42 * influence * (1 - Math.abs(local - 0.74) / 0.22) : 0;
                this.offsets[i] = clamp(this.offsets[i] + (bowl + rim) * (effect.deform || 1), -this.radius * 0.42, this.radius * 0.16);
            } else if (effect.mode === 'laser') {
                this.offsets[i] = clamp(this.offsets[i] - 0.2 * influence * (effect.deform || 1), -this.radius * 0.48, this.radius * 0.1);
            } else if (effect.mode === 'freeze') {
                this.offsets[i] = clamp(this.offsets[i] + 0.018 * influence, -this.radius * 0.2, this.radius * 0.1);
            }

            this.burn[i] = clamp(this.burn[i] + (effect.burn || 0) * influence, 0, 1);
            this.heat[i] = clamp(this.heat[i] + (effect.heat || 0) * influence, 0, 1);
            this.ice[i] = clamp(this.ice[i] + (effect.ice || 0) * influence, 0, 1);
            this.structure[i] = clamp(this.structure[i] + (effect.structure || 0) * influence, 0, 1);
            this.dirtyIndices.add(i);
        }
        this.applyBuffers();
    }

    applySegmentDamage(localStart, localEnd, effect) {
        if (!this.hasPlanet()) return;
        const base = this.basePositions;
        const segment = localEnd.clone().sub(localStart);
        const segmentLengthSq = Math.max(0.0001, segment.lengthSq());
        const radius = effect.radius || this.radius * 0.14;
        const strength = effect.strength || 0.4;

        const stride = Math.max(1, Math.floor(this.performance.vertexStride || 1));
        for (let i = 0; i < this.offsets.length; i += stride) {
            const idx = i * 3;
            const vertex = new this.THREE.Vector3(base[idx], base[idx + 1], base[idx + 2]);
            const t = clamp(vertex.clone().sub(localStart).dot(segment) / segmentLengthSq, 0, 1);
            const closest = localStart.clone().addScaledVector(segment, t);
            const distance = vertex.distanceTo(closest);
            if (distance > radius) continue;
            const influence = smoothFalloff(distance / radius) * strength;
            const innerBoost = 1 + (t > 0.08 && t < 0.92 ? 0.55 : 0);
            this.offsets[i] = clamp(this.offsets[i] - influence * innerBoost * 0.42, -this.radius * 0.55, this.radius * 0.1);
            this.burn[i] = clamp(this.burn[i] + (effect.burn || 0.5) * influence, 0, 1);
            this.heat[i] = clamp(this.heat[i] + (effect.heat || 0.75) * influence, 0, 1);
            this.structure[i] = clamp(this.structure[i] + (effect.structure || 0.35) * influence, 0, 1);
            this.dirtyIndices.add(i);
        }
        this.applyBuffers();
    }

    applyBuffers({ force = false } = {}) {
        if (!this.hasPlanet()) return;
        if (!force && !this.dirtyIndices.size) return;
        const position = this.mesh.geometry.attributes.position;
        const color = this.mesh.geometry.attributes.color;
        const out = position.array;
        const base = this.basePositions;
        const indices = force || !this.dirtyIndices.size ? null : Array.from(this.dirtyIndices);
        const iterate = indices || { length: this.offsets.length, at: (i) => i };

        for (let cursor = 0; cursor < iterate.length; cursor++) {
            const i = indices ? iterate[cursor] : iterate.at(cursor);
            const idx = i * 3;
            const vx = base[idx];
            const vy = base[idx + 1];
            const vz = base[idx + 2];
            const len = Math.hypot(vx, vy, vz) || 1;
            const nx = vx / len;
            const ny = vy / len;
            const nz = vz / len;
            out[idx] = vx + nx * this.offsets[i];
            out[idx + 1] = vy + ny * this.offsets[i];
            out[idx + 2] = vz + nz * this.offsets[i];

            const burn = this.burn[i];
            const heat = this.heat[i];
            const ice = this.ice[i];
            const structure = this.structure[i];
            color.array[idx] = clamp(1 - burn * 0.68 + heat * 0.55 + ice * 0.06 - structure * 0.12, 0.1, 1.55);
            color.array[idx + 1] = clamp(1 - burn * 0.82 - heat * 0.22 + ice * 0.16 - structure * 0.38, 0.05, 1.18);
            color.array[idx + 2] = clamp(1 - burn * 0.88 - heat * 0.34 + ice * 0.52 - structure * 0.42, 0.05, 1.32);
        }

        position.needsUpdate = true;
        color.needsUpdate = true;
        this.dirtyIndices.clear();
        this.applyCount++;
        if (force || this.applyCount % Math.max(1, this.performance.normalEvery || 3) === 0) {
            this.mesh.geometry.computeVertexNormals();
        }
    }

    getSurfaceHeightAtNormal(normal) {
        if (!this.hasPlanet() || !normal) return 0;
        let bestDot = -Infinity;
        let bestIndex = 0;
        const base = this.basePositions;
        for (let i = 0; i < this.offsets.length; i += 4) {
            const idx = i * 3;
            const len = Math.hypot(base[idx], base[idx + 1], base[idx + 2]) || 1;
            const dot = (base[idx] / len) * normal.x + (base[idx + 1] / len) * normal.y + (base[idx + 2] / len) * normal.z;
            if (dot > bestDot) {
                bestDot = dot;
                bestIndex = i;
            }
        }
        const idx = bestIndex * 3;
        const baseHeight = Math.hypot(base[idx], base[idx + 1], base[idx + 2]) - this.radius;
        return baseHeight + (this.offsets[bestIndex] || 0);
    }

    createCraterDecal(localNormal, radius, icy = false) {
        if (!this.hasPlanet()) return;
        const THREE = this.THREE;
        const geometry = new THREE.RingGeometry(radius * 0.34, radius * 0.78, 48, 3);
        const material = new THREE.MeshBasicMaterial({
            color: icy ? 0xbfeeff : 0x120909,
            transparent: true,
            opacity: icy ? 0.35 : 0.46,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const decal = new THREE.Mesh(geometry, material);
        decal.position.copy(localNormal).multiplyScalar(this.radius + radius * 0.03);
        decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
        decal.renderOrder = 3;
        decal.userData.planetChaosDecal = true;
        this.mesh.add(decal);
        this.decals.push(decal);
        if (this.decals.length > 60) {
            const old = this.decals.shift();
            old.parent?.remove(old);
            disposeNode(old);
        }
    }

    clearDecals() {
        while (this.decals.length) {
            const decal = this.decals.pop();
            decal.parent?.remove(decal);
            disposeNode(decal);
        }
    }

    dispose() {
        this.clearDecals();
        this.mesh = null;
        this.basePositions = null;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }
}
