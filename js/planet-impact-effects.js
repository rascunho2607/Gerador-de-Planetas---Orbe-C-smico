const DEBUG_CHAOS_EFFECTS = false;

function debugChaosEffects(...args) {
    if (DEBUG_CHAOS_EFFECTS) console.debug('[ChaosEffects]', ...args);
}

function disposeObject(object) {
    if (!object) return;
    object.parent?.remove(object);
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    object.traverse((child) => {
        if (child.geometry) geometries.add(child.geometry);
        if (!child.material) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        childMaterials.forEach((material) => {
            if (material) materials.add(material);
        });
    });
    materials.forEach((material) => {
        Object.keys(material).forEach((key) => {
            const value = material[key];
            if (value?.isTexture) textures.add(value);
        });
        if (material.uniforms) {
            Object.values(material.uniforms).forEach((uniform) => {
                if (uniform?.value?.isTexture) textures.add(uniform.value);
            });
        }
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    textures.forEach((texture) => texture.dispose?.());
    materials.forEach((material) => material.dispose?.());
}

function randomUnit(THREE) {
    return new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
}

export class PlanetImpactEffects {
    constructor({ THREE, scene }) {
        this.THREE = THREE;
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'PlanetChaosEffects';
        this.scene.add(this.group);
        this.effects = [];
        this.particlePool = [];
        this.disposed = false;
        this.performance = {
            maxEffects: 72,
            maxParticlesPerBurst: 70,
            particleScale: 0.7
        };
    }

    configure(performance = {}) {
        this.performance = { ...this.performance, ...performance };
        this.trimToLimit();
    }

    getActiveCount() {
        return this.effects.length;
    }

    trimToLimit() {
        const limit = Math.max(8, Math.floor(this.performance.maxEffects || 72));
        while (this.effects.length > limit) {
            const effect = this.effects.shift();
            if (effect.recycle) effect.recycle(effect.object);
            else {
                effect.object.parent?.remove(effect.object);
                disposeObject(effect.object);
            }
        }
    }

    ensureGroupAttached() {
        if (this.disposed) return;
        if (!this.group.parent && this.scene) this.scene.add(this.group);
        this.group.visible = true;
    }

    update(deltaTime, timeScale = 1) {
        this.ensureGroupAttached();
        const dt = Math.min(0.05, deltaTime || 0.016) * timeScale;
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.age += dt;
            const t = effect.age / effect.life;
            if (effect.update) effect.update(dt, t, effect.age);
            if (effect.age >= effect.life) {
                if (effect.recycle) effect.recycle(effect.object);
                else {
                    effect.object.parent?.remove(effect.object);
                    disposeObject(effect.object);
                }
                this.effects.splice(i, 1);
            }
        }
    }

    addTimed(object, life, update, recycle = null) {
        this.ensureGroupAttached();
        this.group.add(object);
        this.group.visible = true;
        object.visible = true;
        this.effects.push({ object, life, age: 0, update, recycle });
        this.trimToLimit();
        return object;
    }

    recycleParticleObject(points) {
        points.visible = false;
        points.parent?.remove(points);
        points.geometry.setDrawRange(0, 0);
        this.particlePool.push(points);
        while (this.particlePool.length > 12) {
            const old = this.particlePool.shift();
            disposeObject(old);
        }
    }

    getParticleObject(count, color, size) {
        const THREE = this.THREE;
        const pooled = this.particlePool.pop();
        if (pooled && pooled.geometry.attributes.position.count >= count) {
            pooled.material.color.setHex(color);
            pooled.material.size = size;
            pooled.material.opacity = 0.9;
            pooled.geometry.setDrawRange(0, count);
            return pooled;
        }
        if (pooled) disposeObject(pooled);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setDrawRange(0, count);
        const material = new THREE.PointsMaterial({
            color,
            size,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        return new THREE.Points(geometry, material);
    }

    createMeteor({ start, end, size = 0.6, speed = 1, type = 'rocky', onImpact }) {
        const THREE = this.THREE;
        const meteorSize = Math.max(0.42, size);
        const bodyColor = type === 'icy' ? 0x9dc8d4 : type === 'metallic' ? 0xa9a7a0 : 0x4c342a;
        const craterColor = type === 'icy' ? 0x567f8a : type === 'metallic' ? 0x4b4b4f : 0x1d1512;
        const fireColor = type === 'icy' ? 0x76dfff : type === 'explosive' ? 0xffd166 : 0xff7333;
        const hotColor = type === 'icy' ? 0xc8f7ff : type === 'explosive' ? 0xfff0a8 : 0xff9c43;
        const group = new THREE.Group();
        const velocity = end.clone().sub(start);
        const direction = velocity.clone().normalize();

        const rockGeometry = new THREE.IcosahedronGeometry(meteorSize, 3);
        const pos = rockGeometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i);
            const n = v.clone().normalize();
            const noise =
                0.78 +
                Math.random() * 0.38 +
                0.12 * Math.sin(v.x * 5.1) +
                0.10 * Math.sin(v.y * 7.3) +
                0.08 * Math.sin(v.z * 6.4);
            v.copy(n.multiplyScalar(meteorSize * noise));
            pos.setXYZ(i, v.x, v.y, v.z);
        }
        rockGeometry.computeVertexNormals();

        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bodyColor,
            roughness: 0.86,
            metalness: type === 'metallic' ? 0.42 : 0.04,
            emissive: fireColor,
            emissiveIntensity: type === 'icy' ? 0.08 : 0.22
        });
        const craterMaterial = new THREE.MeshStandardMaterial({
            color: craterColor,
            roughness: 0.95,
            metalness: 0.02,
            emissive: type === 'icy' ? 0x10242a : 0x220806,
            emissiveIntensity: 0.18
        });
        const emberMaterial = new THREE.MeshBasicMaterial({
            color: hotColor,
            transparent: true,
            opacity: 0.62,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const body = new THREE.Mesh(rockGeometry, bodyMaterial);
        body.position.y = meteorSize * 0.3;
        body.userData.spinAxis = randomUnit(THREE);
        body.userData.spinSpeed = 2.5 + Math.random() * 4.0;

        const spotGeometry = new THREE.SphereGeometry(meteorSize * 0.115, 8, 6);
        for (let i = 0; i < 10; i++) {
            const normal = randomUnit(THREE);
            const crater = new THREE.Mesh(spotGeometry, i % 3 === 0 ? emberMaterial : craterMaterial);
            crater.position.copy(normal).multiplyScalar(meteorSize * (0.92 + Math.random() * 0.2));
            crater.scale.set(1.15 + Math.random() * 0.8, 0.22, 0.7 + Math.random() * 0.55);
            crater.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            body.add(crater);
        }

        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(meteorSize * 1.9, 24, 16),
            new THREE.MeshBasicMaterial({ color: fireColor, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        glow.position.y = -meteorSize * 0.15;
        const frontAura = new THREE.Mesh(
            new THREE.SphereGeometry(meteorSize * 1.28, 24, 14),
            new THREE.MeshBasicMaterial({ color: hotColor, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        frontAura.position.y = meteorSize * 0.82;
        const trail = this.createTrail(meteorSize, fireColor);
        group.add(trail, glow, frontAura, body);
        group.position.copy(start);
        group.userData.start = start.clone();
        group.userData.end = end.clone();
        const distance = start.distanceTo(end);
        const life = Math.max(1.35, Math.min(4.2, distance / (12 * Math.max(0.25, speed))));
        let impacted = false;
        const meteor = this.addTimed(group, life, (dt, t) => {
            const eased = Math.min(1, t * t * (3 - 2 * t));
            const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 12);
            group.position.lerpVectors(start, end, eased);
            group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            body.rotateOnAxis(body.userData.spinAxis, body.userData.spinSpeed * dt);
            glow.scale.setScalar(1 + pulse * 0.16 + t * 0.18);
            glow.material.opacity = 0.18 + pulse * 0.12;
            frontAura.scale.setScalar(1 + pulse * 0.1 + t * 0.2);
            frontAura.material.opacity = 0.16 + pulse * 0.12;
            this.updateTrail(trail, dt, t, pulse);
            if (!impacted && t >= 0.98) {
                impacted = true;
                onImpact?.();
            }
        });
        debugChaosEffects('meteor created', {
            groupParent: Boolean(this.group.parent),
            activeEffects: this.effects.length,
            life: Number(life.toFixed(2))
        });
        return meteor;
    }

    createTrail(size, color) {
        const THREE = this.THREE;
        const group = new THREE.Group();
        const outerMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const innerMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff0a5,
            transparent: true,
            opacity: 0.34,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const emberMaterial = new THREE.PointsMaterial({
            color,
            size: size * 0.18,
            transparent: true,
            opacity: 0.78,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const outer = new THREE.Mesh(new THREE.ConeGeometry(size * 0.92, size * 6.4, 22, 1, true), outerMaterial);
        outer.position.y = -size * 3.05;
        const inner = new THREE.Mesh(new THREE.ConeGeometry(size * 0.42, size * 4.7, 18, 1, true), innerMaterial);
        inner.position.y = -size * 2.45;

        const sparkCount = 24;
        const sparkGeometry = new THREE.BufferGeometry();
        const sparkPositions = new Float32Array(sparkCount * 3);
        for (let i = 0; i < sparkCount; i++) {
            const idx = i * 3;
            const drift = (Math.random() - 0.5) * size * 0.75;
            sparkPositions[idx] = drift;
            sparkPositions[idx + 1] = -size * (1.0 + Math.random() * 4.7);
            sparkPositions[idx + 2] = (Math.random() - 0.5) * size * 0.75;
        }
        sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
        const sparks = new THREE.Points(sparkGeometry, emberMaterial);
        group.add(outer, inner, sparks);
        group.userData.outer = outer;
        group.userData.inner = inner;
        group.userData.sparks = sparks;
        group.userData.sparkBaseSize = emberMaterial.size;
        return group;
    }

    updateTrail(trail, dt, t, pulse) {
        const outer = trail.userData.outer;
        const inner = trail.userData.inner;
        const sparks = trail.userData.sparks;
        const fade = Math.max(0, 1 - t * 0.32);
        if (outer) {
            outer.scale.set(1 + pulse * 0.16, 1 + pulse * 0.28, 1 + pulse * 0.16);
            outer.rotation.y += dt * 1.8;
            outer.material.opacity = 0.14 * fade + pulse * 0.09;
        }
        if (inner) {
            inner.scale.set(1 + pulse * 0.22, 1 + pulse * 0.36, 1 + pulse * 0.22);
            inner.rotation.y -= dt * 2.7;
            inner.material.opacity = 0.26 * fade + pulse * 0.16;
        }
        if (sparks) {
            sparks.rotation.y += dt * 2.2;
            sparks.material.opacity = 0.55 * fade + pulse * 0.24;
            sparks.material.size = trail.userData.sparkBaseSize * (0.8 + pulse * 0.65);
        }
    }

    createExplosion(position, normal, options = {}) {
        const THREE = this.THREE;
        const color = options.color || 0xff8a32;
        const radius = options.radius || 3;
        const group = new THREE.Group();
        group.position.copy(position);
        const shock = new THREE.Mesh(
            new THREE.RingGeometry(radius * 0.14, radius * 0.18, 64),
            new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
        );
        shock.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
        group.add(shock);
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.23, 24, 16),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        group.add(flash);
        const particles = this.createParticles(position, normal, {
            count: Math.floor(70 + radius * 18),
            color,
            spread: radius * 0.55,
            speed: radius * 2.4,
            life: 1.2
        });
        return this.addTimed(group, 0.72, (dt, t) => {
            shock.scale.setScalar(1 + t * radius * 0.9);
            shock.material.opacity = 0.75 * (1 - t);
            flash.scale.setScalar(1 + t * 4);
            flash.material.opacity = 0.78 * (1 - t);
            if (t > 0.99) particles.userData.fadeFast = true;
        });
    }

    createLaserBeam(start, end, color = 0xff385f, thickness = 0.08) {
        const THREE = this.THREE;
        const direction = end.clone().sub(start);
        const length = direction.length();
        if (length <= 0.001) return null;
        const beamDirection = direction.normalize();
        const baseThickness = Math.max(0.075, thickness);
        const group = new THREE.Group();
        const beamMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff3cc,
            transparent: true,
            opacity: 0.82,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false
        });
        const glowMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false
        });
        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(baseThickness * 0.42, baseThickness * 0.28, Math.max(0.1, length), 16, 1, true),
            beamMaterial
        );
        const glow = new THREE.Mesh(
            new THREE.CylinderGeometry(baseThickness * 1.65, baseThickness * 1.15, Math.max(0.1, length), 18, 1, true),
            glowMaterial
        );
        const impact = new THREE.Mesh(
            new THREE.SphereGeometry(baseThickness * 2.1, 18, 10),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
        );
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(baseThickness * 1.25, baseThickness * 2.8, 28),
            new THREE.MeshBasicMaterial({ color: 0xfff3cc, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
        );
        beam.position.copy(start).lerp(end, 0.5);
        glow.position.copy(beam.position);
        impact.position.copy(end);
        ring.position.copy(end);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDirection);
        glow.quaternion.copy(beam.quaternion);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), beamDirection);
        group.add(glow, beam, impact, ring);
        group.traverse((object) => {
            object.renderOrder = 12;
        });
        const laser = this.addTimed(group, 0.18, (dt, t) => {
            const fade = Math.max(0, 1 - t);
            beam.material.opacity = 0.82 * fade;
            glow.material.opacity = 0.3 * fade;
            impact.material.opacity = 0.72 * fade;
            impact.scale.setScalar(1 + t * 2.2);
            ring.material.opacity = 0.55 * fade;
            ring.scale.setScalar(1 + t * 3.4);
        });
        debugChaosEffects('laser created', {
            groupParent: Boolean(this.group.parent),
            activeEffects: this.effects.length,
            length: Number(length.toFixed(2))
        });
        return laser;
    }

    createParticles(position, normal, options = {}) {
        const THREE = this.THREE;
        const count = Math.max(4, Math.min(
            this.performance.maxParticlesPerBurst || 70,
            Math.floor((options.count || 48) * (this.performance.particleScale || 1))
        ));
        const velocities = [];
        const baseNormal = normal.clone().normalize();
        const points = this.getParticleObject(count, options.color || 0xff8a32, options.size || 0.22);
        const positions = points.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            positions[idx] = position.x;
            positions[idx + 1] = position.y;
            positions[idx + 2] = position.z;
            const scatter = randomUnit(THREE).multiplyScalar(options.spread || 1);
            const velocity = baseNormal.clone().multiplyScalar((options.upward ?? 1) * (0.6 + Math.random()) * (options.speed || 4));
            velocity.add(scatter);
            velocities.push(velocity);
        }
        const geometry = points.geometry;
        const material = points.material;
        geometry.attributes.position.needsUpdate = true;
        return this.addTimed(points, options.life || 1.0, (dt, t) => {
            const array = geometry.attributes.position.array;
            for (let i = 0; i < count; i++) {
                const idx = i * 3;
                velocities[i].multiplyScalar(0.985);
                array[idx] += velocities[i].x * dt;
                array[idx + 1] += velocities[i].y * dt;
                array[idx + 2] += velocities[i].z * dt;
            }
            geometry.attributes.position.needsUpdate = true;
            material.opacity = 0.9 * (1 - t);
            material.size = (options.size || 0.22) * (1 + t * 1.5);
        }, (object) => this.recycleParticleObject(object));
    }

    damageObject(object, point, options = {}) {
        const THREE = this.THREE;
        object.traverse((child) => {
            if (!child.material || !child.isMesh) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                if (material.color) material.color.lerp(new THREE.Color(options.color || 0xff5030), 0.35);
                if ('emissive' in material) {
                    material.emissive = material.emissive || new THREE.Color(0x000000);
                    material.emissive.lerp(new THREE.Color(options.color || 0xff5030), 0.45);
                    material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, 0.35);
                }
                material.needsUpdate = true;
            });
        });
        this.createExplosion(point, point.clone().normalize(), { radius: options.radius || 2.2, color: options.color || 0xff7040 });
    }

    clear() {
        while (this.effects.length) {
            const effect = this.effects.pop();
            effect.object.parent?.remove(effect.object);
            disposeObject(effect.object);
        }
        while (this.group.children.length) {
            disposeObject(this.group.children[0]);
        }
        this.ensureGroupAttached();
        debugChaosEffects('effects cleared', {
            groupParent: Boolean(this.group.parent),
            activeEffects: this.effects.length
        });
    }

    dispose() {
        this.clear();
        this.disposed = true;
        while (this.particlePool.length) disposeObject(this.particlePool.pop());
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
