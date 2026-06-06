function disposeObject(object) {
    if (!object) return;
    object.parent?.remove(object);
    const geometries = new Set();
    const materials = new Set();
    object.traverse((child) => {
        if (child.geometry && !child.userData?.sharedChaosResources) geometries.add(child.geometry);
        if (!child.material) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        if (!child.userData?.sharedChaosResources) {
            childMaterials.forEach((material) => {
                if (material) materials.add(material);
            });
        }
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
}

function randomUnit(THREE) {
    return new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
}

export class PlanetFractureSystem {
    constructor({ THREE, scene, radius = 10 }) {
        this.THREE = THREE;
        this.scene = scene;
        this.radius = radius;
        this.group = new THREE.Group();
        this.group.name = 'PlanetFractureSystem';
        this.scene.add(this.group);
        this.fragments = [];
        this.visible = true;
    }

    setVisible(visible) {
        this.visible = visible;
        this.group.visible = visible;
    }

    configure(performance = {}) {
        this.performance = {
            maxFragments: performance.maxFragments ?? this.performance?.maxFragments ?? 70,
            fragmentScale: performance.fragmentScale ?? this.performance?.fragmentScale ?? 0.65
        };
        this.trimToLimit();
    }

    getActiveCount() {
        return this.fragments.length;
    }

    getSharedGeometry(detail = 0) {
        this.sharedGeometries = this.sharedGeometries || new Map();
        const key = `dodeca-${detail}`;
        if (!this.sharedGeometries.has(key)) {
            this.sharedGeometries.set(key, new this.THREE.DodecahedronGeometry(1, detail));
        }
        return this.sharedGeometries.get(key);
    }

    getSharedMaterial(color, hot = false) {
        this.sharedMaterials = this.sharedMaterials || new Map();
        const key = `${color}-${hot ? 1 : 0}`;
        if (!this.sharedMaterials.has(key)) {
            this.sharedMaterials.set(key, new this.THREE.MeshStandardMaterial({
                color,
                roughness: 0.9,
                metalness: 0.04,
                emissive: hot ? 0x331000 : 0x000000,
                emissiveIntensity: hot ? 0.25 : 0
            }));
        }
        return this.sharedMaterials.get(key);
    }

    trimToLimit() {
        const limit = Math.max(0, Math.floor(this.performance?.maxFragments ?? 70));
        while (this.fragments.length > limit) {
            const old = this.fragments.shift();
            old.parent?.remove(old);
            disposeObject(old);
        }
    }

    ejectFragments(origin, normal, options = {}) {
        const THREE = this.THREE;
        const strength = options.strength || 0.6;
        const radius = options.radius || this.radius * 0.4;
        const scale = this.performance?.fragmentScale ?? 0.65;
        const remaining = Math.max(0, (this.performance?.maxFragments ?? 70) - this.fragments.length);
        const count = Math.min(remaining, Math.floor((options.count || (8 + strength * 22)) * scale));
        if (count <= 0) return;
        const baseNormal = normal.clone().normalize();
        const palette = options.palette || [0x6c5244, 0x8c7666, 0x3b2f2c, 0xb57a54];

        for (let i = 0; i < count; i++) {
            const size = radius * (0.035 + Math.random() * 0.11) * (strength > 0.8 && Math.random() > 0.82 ? 2.2 : 1);
            const color = palette[Math.floor(Math.random() * palette.length)];
            const fragment = new THREE.Mesh(
                this.getSharedGeometry(Math.random() > 0.82 ? 1 : 0),
                this.getSharedMaterial(color, options.hot)
            );
            fragment.userData.sharedChaosResources = true;
            fragment.scale.setScalar(size);
            const scatter = randomUnit(THREE).multiplyScalar(radius * 0.32);
            fragment.position.copy(origin).add(scatter).addScaledVector(baseNormal, size * 2);
            fragment.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

            const tangential = randomUnit(THREE).cross(baseNormal).normalize().multiplyScalar((0.8 + Math.random()) * strength * this.radius * 0.45);
            const velocity = baseNormal.clone().multiplyScalar((0.9 + Math.random() * 1.6) * strength * this.radius);
            velocity.add(tangential);
            fragment.userData.velocity = velocity;
            fragment.userData.spin = randomUnit(THREE).multiplyScalar(0.015 + Math.random() * 0.055);
            fragment.userData.age = 0;
            fragment.userData.life = 16 + Math.random() * 22;
            fragment.userData.orbitCapture = Math.random() < Math.min(0.78, 0.22 + strength * 0.58);
            fragment.userData.orbitRadius = origin.length() + radius * (0.7 + Math.random() * 2.4);
            fragment.userData.orbitPhase = Math.atan2(origin.z, origin.x) + Math.random() * 0.9;
            fragment.userData.orbitSpeed = (0.002 + Math.random() * 0.006) * (Math.random() > 0.5 ? 1 : -1);
            this.group.add(fragment);
            this.fragments.push(fragment);
        }

        this.trimToLimit();
    }

    createStructuralCracks(origin, normal, options = {}) {
        const THREE = this.THREE;
        const count = Math.floor(options.count || 5);
        const radius = options.radius || this.radius * 0.5;
        const group = new THREE.Group();
        group.position.copy(origin).addScaledVector(normal, 0.08);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.35;
            const length = radius * (0.45 + Math.random() * 0.95);
            const width = Math.max(0.035, radius * (0.012 + Math.random() * 0.025));
            const crack = new THREE.Mesh(
                new THREE.PlaneGeometry(width, length),
                new THREE.MeshBasicMaterial({
                    color: options.hot ? 0xff4f23 : 0x080606,
                    transparent: true,
                    opacity: options.hot ? 0.58 : 0.48,
                    blending: options.hot ? THREE.AdditiveBlending : THREE.NormalBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide
                })
            );
            crack.position.set(Math.cos(angle) * length * 0.22, Math.sin(angle) * length * 0.22, 0);
            crack.rotation.z = angle;
            group.add(crack);
        }

        group.userData.age = 0;
        group.userData.life = 18;
        this.group.add(group);
        this.fragments.push(group);
    }

    update(deltaTime, timeScale = 1) {
        const dt = Math.min(0.05, deltaTime || 0.016) * timeScale;
        for (let i = this.fragments.length - 1; i >= 0; i--) {
            const item = this.fragments[i];
            item.userData.age += dt;
            if (item.userData.velocity) {
                if (item.userData.orbitCapture && item.userData.age > 1.1) {
                    item.userData.orbitPhase += item.userData.orbitSpeed * timeScale;
                    item.position.x = Math.cos(item.userData.orbitPhase) * item.userData.orbitRadius;
                    item.position.z = Math.sin(item.userData.orbitPhase) * item.userData.orbitRadius;
                    item.position.y += Math.sin(item.userData.age * 1.7) * 0.004 * this.radius;
                    item.userData.velocity.multiplyScalar(0.92);
                } else {
                    item.position.addScaledVector(item.userData.velocity, dt);
                    item.userData.velocity.multiplyScalar(0.988);
                }
                item.rotation.x += item.userData.spin.x;
                item.rotation.y += item.userData.spin.y;
                item.rotation.z += item.userData.spin.z;
            }
            if (item.userData.age > item.userData.life) {
                item.parent?.remove(item);
                disposeObject(item);
                this.fragments.splice(i, 1);
            }
        }
    }

    clear() {
        while (this.fragments.length) {
            const fragment = this.fragments.pop();
            fragment.parent?.remove(fragment);
            disposeObject(fragment);
        }
        this.sharedGeometries?.forEach((geometry) => geometry.dispose());
        this.sharedMaterials?.forEach((material) => material.dispose());
        this.sharedGeometries?.clear();
        this.sharedMaterials?.clear();
    }

    dispose() {
        this.clear();
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}
