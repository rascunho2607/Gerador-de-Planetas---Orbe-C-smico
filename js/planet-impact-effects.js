function disposeObject(object) {
    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (!child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
    });
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

    update(deltaTime, timeScale = 1) {
        const dt = Math.min(0.05, deltaTime || 0.016) * timeScale;
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.age += dt;
            const t = effect.age / effect.life;
            if (effect.update) effect.update(dt, t);
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
        this.group.add(object);
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
        const bodyColor = type === 'icy' ? 0xbfefff : type === 'metallic' ? 0xd8d6cf : 0x8a5a3c;
        const fireColor = type === 'icy' ? 0x76dfff : type === 'explosive' ? 0xffd166 : 0xff7333;
        const group = new THREE.Group();
        const velocity = end.clone().sub(start);
        const direction = velocity.clone().normalize();
        const body = new THREE.Mesh(
            new THREE.DodecahedronGeometry(size, 1),
            new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.74, metalness: type === 'metallic' ? 0.45 : 0.08, emissive: fireColor, emissiveIntensity: 0.18 })
        );
        body.position.y = size * 0.38;
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(size * 1.75, 18, 12),
            new THREE.MeshBasicMaterial({ color: fireColor, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        glow.position.y = -size * 0.22;
        const trail = this.createTrail(size, fireColor);
        group.add(trail, glow, body);
        group.position.copy(start);
        group.userData.start = start.clone();
        group.userData.end = end.clone();
        const distance = start.distanceTo(end);
        const life = Math.max(1.15, Math.min(3.8, distance / (14 * Math.max(0.25, speed))));
        let impacted = false;
        return this.addTimed(group, life, (dt, t) => {
            const eased = Math.min(1, t * t * (3 - 2 * t));
            group.position.lerpVectors(start, end, eased);
            group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            body.rotation.x += dt * 3.2;
            body.rotation.y += dt * 2.4;
            glow.scale.setScalar(1 + Math.sin(t * Math.PI * 8) * 0.12);
            if (!impacted && t >= 0.98) {
                impacted = true;
                onImpact?.();
            }
        });
    }

    createTrail(size, color) {
        const THREE = this.THREE;
        const geometry = new THREE.ConeGeometry(size * 0.65, size * 5.8, 18, 1, true);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.26,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const trail = new THREE.Mesh(geometry, material);
        trail.position.y = -size * 3.05;
        return trail;
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
        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(thickness, thickness * 0.5, Math.max(0.1, length), 14, 1, true),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        beam.position.copy(start).lerp(end, 0.5);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        return this.addTimed(beam, 0.08, (dt, t) => {
            beam.material.opacity = 0.62 * (1 - t);
        });
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

    dispose() {
        while (this.effects.length) {
            const effect = this.effects.pop();
            effect.object.parent?.remove(effect.object);
            disposeObject(effect.object);
        }
        while (this.particlePool.length) disposeObject(this.particlePool.pop());
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
