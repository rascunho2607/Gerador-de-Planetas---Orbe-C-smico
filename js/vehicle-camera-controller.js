const EPSILON = 0.000001;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothFactor(speed, deltaTime) {
    return 1 - Math.exp(-Math.max(0.001, speed) * Math.max(0, deltaTime || 0));
}

function lerpAngle(from, to, alpha) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * alpha;
}

function isFiniteVector(vector) {
    return Boolean(vector && Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z));
}

export class VehicleCameraController {
    constructor({ THREE, camera, renderer, getSettings = () => ({}) }) {
        this.THREE = THREE;
        this.camera = camera;
        this.renderer = renderer;
        this.getSettings = getSettings;
        this.distanceScale = 1;
        this.baseFov = camera.fov || 55;
        this.fov = camera.fov || 55;
        this.mode = 'third';
        this.yaw = 0;
        this.pitch = 0.18;
        this.targetYaw = 0;
        this.targetPitch = 0.18;
        this.lastMouseMoveTime = 0;
        this.autoAlignDelay = 1200;
        this.autoAlignStrength = 2.5;
        this.firstPersonThreshold = 0.2;
        this.maxPitch = Math.PI * 0.42;
        this.tmpVecA = new THREE.Vector3();
        this.tmpVecB = new THREE.Vector3();
        this.tmpVecC = new THREE.Vector3();
        this.tmpVecD = new THREE.Vector3();
        this.tmpQuat = new THREE.Quaternion();
    }

    resetForVehicle(vehicle) {
        this.distanceScale = 1;
        this.baseFov = vehicle.type === 'ship' ? 62 : 58;
        this.fov = this.baseFov;
        this.mode = 'third';
        this.yaw = 0;
        this.pitch = this.getDefaultPitch(vehicle);
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
        this.lastMouseMoveTime = performance.now();
        this.applyFov();
    }

    applyFov() {
        this.camera.fov = clamp(this.fov, 38, 88);
        this.camera.updateProjectionMatrix();
    }

    handleMouseMove(movementX, movementY, vehicle = null) {
        if (vehicle?.type === 'ship') {
            const settings = this.getSettings();
            const sensitivity = 0.0011 * Math.max(0.1, Number(settings.shipMouseSensitivity ?? 1));
            this.targetYaw -= (movementX || 0) * sensitivity;
            this.targetPitch = clamp(this.targetPitch - (movementY || 0) * sensitivity, -this.getMaxPitch(vehicle), this.getMaxPitch(vehicle));
        } else {
            const sensitivity = 0.0024 * Math.max(0.1, Number(this.getSettings().explorationMouseSensitivity || 1));
            this.yaw -= (movementX || 0) * sensitivity;
            this.pitch = clamp(this.pitch + (movementY || 0) * sensitivity, -this.getMaxPitch(vehicle), this.getMaxPitch(vehicle));
            this.targetYaw = this.yaw;
            this.targetPitch = this.pitch;
        }
        this.lastMouseMoveTime = performance.now();
    }

    handleWheel(deltaY, vehicle) {
        const direction = Math.sign(deltaY || 0);
        const step = vehicle.type === 'ship' ? 0.12 : 0.1;
        const maxScale = vehicle.type === 'ship' ? 2.8 : 2.4;
        this.distanceScale = clamp(this.distanceScale + direction * step, 0.08, maxScale);
        this.mode = this.distanceScale <= this.firstPersonThreshold ? 'first' : 'third';
        if (this.mode === 'first') {
            this.fov = clamp(this.fov + direction * 2, 42, 82);
            this.applyFov();
        }
    }

    getCameraForward(vehicle, target) {
        const basis = this.getBasis(vehicle);
        const horizontal = this.getYawForward(basis, this.tmpVecA);
        target.copy(horizontal)
            .multiplyScalar(Math.cos(this.pitch))
            .addScaledVector(basis.up, Math.sin(this.pitch));
        if (target.lengthSq() < EPSILON) target.copy(basis.forward);
        return target.normalize();
    }

    update(vehicle, deltaTime, options = {}) {
        if (!vehicle?.group) return;
        const now = performance.now();
        const autoAlignDelay = vehicle.type === 'ship' ? 2500 : this.autoAlignDelay;
        const autoAlignStrength = vehicle.type === 'ship' ? 0.6 : this.autoAlignStrength;
        const noRecentMouse = now - this.lastMouseMoveTime > autoAlignDelay;
        if (noRecentMouse) {
            const align = smoothFactor(autoAlignStrength, deltaTime);
            this.targetYaw = lerpAngle(this.targetYaw, 0, align);
            this.targetPitch += (this.getDefaultPitch(vehicle) - this.targetPitch) * align;
        }
        const inputAlpha = vehicle.type === 'ship' ? smoothFactor(10, deltaTime) : 1;
        this.yaw = lerpAngle(this.yaw, this.targetYaw, inputAlpha);
        this.pitch += (this.targetPitch - this.pitch) * inputAlpha;
        this.pitch = clamp(this.pitch, -this.getMaxPitch(vehicle), this.getMaxPitch(vehicle));

        const basis = this.getBasis(vehicle);
        const target = vehicle.group.getWorldPosition(this.tmpVecA);
        const config = this.getCameraConfig(vehicle, options);
        const yawForward = this.getYawForward(basis, this.tmpVecB);
        const right = this.tmpVecC.crossVectors(yawForward, basis.up);
        if (right.lengthSq() < EPSILON) right.copy(this.fallbackRight(basis));
        right.normalize();

        let desired = target.clone();
        if (this.mode === 'first') {
            desired
                .addScaledVector(basis.up, config.firstPersonHeight)
                .addScaledVector(basis.forward, config.firstPersonForward);
        } else {
            const pitchLift = clamp(
                Math.sin(this.pitch) * config.distance * 0.55,
                -config.height * 0.65,
                config.height * 1.4
            );
            desired
                .addScaledVector(yawForward, -config.distance)
                .addScaledVector(basis.up, config.height + pitchLift)
                .addScaledVector(right, Math.sin(now * 0.006) * (options.shake || 0));
        }

        this.keepAboveSurface(desired, options, config.clearance, vehicle.type === 'jeep');

        const speedRatio = clamp((vehicle.speed || 0) / Math.max(0.001, vehicle.maxSpeed || 1), 0, 1);
        const fovBoost = vehicle.type === 'ship'
            ? speedRatio * 5
            : speedRatio * 10 + (options.input?.boost ? 5 : 0);
        const targetFov = this.baseFov + fovBoost;
        this.fov += (targetFov - this.fov) * smoothFactor(vehicle.type === 'ship' ? 3.2 : 4, deltaTime);

        const speedLookAhead = config.lookAheadBase + speedRatio * config.maxLookAhead;
        const lookTarget = target.clone()
            .addScaledVector(basis.up, config.targetHeight)
            .addScaledVector(yawForward, config.targetForward + speedLookAhead);

        const cameraSmooth = vehicle.type === 'ship' ? 5.5 : 8.5;
        const alpha = deltaTime <= 0 ? 1 : smoothFactor(this.mode === 'first' ? 24 : cameraSmooth, deltaTime);
        if (options.instant || !isFiniteVector(this.camera.position)) {
            this.camera.position.copy(desired);
            this.camera.up.copy(basis.up);
        } else {
            this.camera.position.lerp(desired, alpha);
            this.camera.up.lerp(basis.up, smoothFactor(vehicle.type === 'ship' ? 7 : 12, deltaTime)).normalize();
        }

        if (!isFiniteVector(this.camera.position) || !isFiniteVector(lookTarget)) {
            if (!options.resetAttempt) this.resetBehindVehicle(vehicle, options);
            return;
        }

        this.camera.lookAt(lookTarget);
        this.applyFov();
        this.logDebug(vehicle, desired, basis);
    }

    getBasis(vehicle) {
        const up = vehicle.upWorld?.clone?.() || new this.THREE.Vector3(0, 1, 0);
        if (!isFiniteVector(up) || up.lengthSq() < EPSILON) up.set(0, 1, 0);
        up.normalize();

        const forward = vehicle.forwardWorld?.clone?.() || new this.THREE.Vector3(0, 0, -1);
        if (!isFiniteVector(forward) || forward.lengthSq() < EPSILON) {
            vehicle.group.getWorldDirection(forward);
        }
        if (forward.lengthSq() < EPSILON) forward.set(0, 0, -1);
        forward.addScaledVector(up, -forward.dot(up)).normalize();
        if (forward.lengthSq() < EPSILON) {
            forward.copy(Math.abs(up.y) > 0.86 ? new this.THREE.Vector3(1, 0, 0) : new this.THREE.Vector3(0, 1, 0));
            forward.addScaledVector(up, -forward.dot(up)).normalize();
        }
        return { up: up.normalize(), forward };
    }

    getYawForward(basis, target) {
        target.copy(basis.forward).applyAxisAngle(basis.up, this.yaw);
        target.addScaledVector(basis.up, -target.dot(basis.up));
        if (target.lengthSq() < EPSILON) target.copy(basis.forward);
        return target.normalize();
    }

    fallbackRight(basis) {
        const helper = Math.abs(basis.up.y) > 0.86
            ? new this.THREE.Vector3(1, 0, 0)
            : new this.THREE.Vector3(0, 1, 0);
        return helper.cross(basis.up).normalize();
    }

    getDefaultPitch(vehicle) {
        return vehicle?.type === 'ship' ? 0.1 : 0.18;
    }

    getMaxPitch(vehicle) {
        return vehicle?.type === 'ship' ? Math.PI * 0.36 : this.maxPitch;
    }

    getCameraConfig(vehicle, options) {
        const planetRadius = Math.max(1, Number(options.planetRadius || 0));
        const vehicleScale = Math.max(0.1, Number(vehicle.scale || 1));
        if (vehicle.type === 'ship') {
            const distance = Math.max(7, vehicleScale * 6, planetRadius * 0.42) * this.distanceScale;
            return {
                distance,
                height: Math.max(2.4, vehicleScale * 2, planetRadius * 0.14),
                clearance: Math.max(1, planetRadius * 0.05, vehicleScale),
                targetHeight: Math.max(1, vehicleScale * 0.8),
                targetForward: Math.max(2, vehicleScale * 1.7),
                firstPersonHeight: Math.max(0.65, vehicleScale * 0.72),
                firstPersonForward: Math.max(0.75, vehicleScale * 0.95),
                lookAheadBase: Math.max(1.1, vehicleScale * 0.5),
                maxLookAhead: Math.max(2.4, planetRadius * 0.35)
            };
        }

        const distance = Math.max(3.4, planetRadius * 0.3, vehicleScale * 5.2) * this.distanceScale;
        return {
            distance,
            height: Math.max(1.55, planetRadius * 0.105, vehicleScale * 1.8),
            clearance: Math.max(0.65, planetRadius * 0.04, vehicleScale * 0.8),
            targetHeight: Math.max(0.8, planetRadius * 0.035, vehicleScale * 0.85),
            targetForward: Math.max(1.2, vehicleScale * 1.4),
            firstPersonHeight: Math.max(0.55, vehicleScale * 0.7),
            firstPersonForward: Math.max(0.35, vehicleScale * 0.45),
            lookAheadBase: Math.max(1.5, vehicleScale * 0.7),
            maxLookAhead: Math.max(1.8, planetRadius * 0.28)
        };
    }

    keepAboveSurface(position, options, clearance, force = false) {
        if (!options.planetCenter || !options.planetRadius) return;
        const fromCenter = this.tmpVecD.copy(position).sub(options.planetCenter);
        const distance = fromCenter.length();
        if (distance < EPSILON) return;
        const nearPlanet = force || distance < options.planetRadius * 8;
        if (!nearPlanet) return;

        const normal = fromCenter.multiplyScalar(1 / distance);
        const surfaceHeight = Number(options.getSurfaceHeightForWorldNormal?.(normal) || 0);
        const minRadius = options.planetRadius + (Number.isFinite(surfaceHeight) ? surfaceHeight : 0) + clearance;
        if (distance < minRadius) {
            position.copy(options.planetCenter).addScaledVector(normal, minRadius);
        }
    }

    resetBehindVehicle(vehicle, options = {}) {
        this.yaw = 0;
        this.pitch = this.getDefaultPitch(vehicle);
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
        this.distanceScale = 1;
        this.mode = 'third';
        this.update(vehicle, 0, { ...options, instant: true, resetAttempt: true });
    }

    logDebug(vehicle, desired, basis) {
        if (!this.getSettings().vehicleCameraDebug) return;
        console.debug('[vehicle-camera]', {
            type: vehicle.type,
            mode: this.mode,
            distanceScale: this.distanceScale,
            vehicle: vehicle.group.position.toArray(),
            forward: basis.forward.toArray(),
            up: basis.up.toArray(),
            desired: desired.toArray(),
            camera: this.camera.position.toArray()
        });
    }
}
