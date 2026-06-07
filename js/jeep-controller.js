const EPSILON = 0.000001;
const VEHICLE_SPEED_BALANCE = 1 / 3;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothFactor(speed, deltaTime) {
    return 1 - Math.exp(-Math.max(0.001, speed) * Math.max(0, deltaTime || 0));
}

export class JeepController {
    constructor({ THREE, getPlanetRadius, getPlanetCenter, getPlanetSurfaceHeight }) {
        this.THREE = THREE;
        this.getPlanetRadius = getPlanetRadius;
        this.getPlanetCenter = getPlanetCenter;
        this.getPlanetSurfaceHeight = getPlanetSurfaceHeight;
        this.tmpVecA = new THREE.Vector3();
        this.tmpVecB = new THREE.Vector3();
        this.tmpVecC = new THREE.Vector3();
    }

    update(vehicle, deltaTime, input) {
        const radius = this.getPlanetRadius();
        const center = this.getPlanetCenter();
        const normal = vehicle.localPosition.clone().sub(center).normalize();
        const surfaceRadius = radius + this.getSurfaceHeight(normal) + vehicle.scale * 0.38;
        const toSurface = center.clone().addScaledVector(normal, surfaceRadius);
        const altitude = vehicle.localPosition.distanceTo(center) - surfaceRadius;
        vehicle.grounded = altitude <= vehicle.scale * 0.34;

        if (vehicle.grounded) {
            vehicle.localPosition.lerp(toSurface, smoothFactor(18, deltaTime));
            vehicle.verticalVelocity = Math.max(0, vehicle.verticalVelocity || 0);
        } else {
            vehicle.verticalVelocity = (vehicle.verticalVelocity || 0) - radius * 1.3 * deltaTime;
            vehicle.localPosition.addScaledVector(normal, vehicle.verticalVelocity * deltaTime);
        }

        vehicle.normal.copy(normal);
        this.projectDirectionOntoTangent(vehicle.forward, normal, this.tangentFromNormal(normal));

        const throttle = (input.forward || 0);
        const steering = input.right || 0;
        const isBoosting = input.boost && throttle > 0;
        const maxSpeed = radius * (isBoosting ? 5.2 : 2.8) * VEHICLE_SPEED_BALANCE;
        const reverseLimit = radius * 1.2 * VEHICLE_SPEED_BALANCE;
        const accel = radius * (vehicle.grounded ? (isBoosting ? 9.0 : 5.4) : (isBoosting ? 3.2 : 1.6)) * VEHICLE_SPEED_BALANCE;
        const brake = radius * 5.0 * VEHICLE_SPEED_BALANCE;
        const drag = vehicle.grounded ? 1.1 : 0.35;
        vehicle.maxSpeed = maxSpeed;

        if (Math.abs(steering) > EPSILON) {
            const speedRatio = clamp(vehicle.velocity.length() / Math.max(0.001, radius * 0.65), 0.15, 1.25);
            vehicle.forward.applyAxisAngle(normal, -steering * deltaTime * (2.4 + speedRatio * 1.6));
            this.projectDirectionOntoTangent(vehicle.forward, normal, this.tangentFromNormal(normal));
        }

        if (throttle !== 0) {
            vehicle.velocity.addScaledVector(vehicle.forward, throttle * accel * deltaTime);
            if (vehicle.grounded) vehicle.velocity.addScaledVector(vehicle.forward, throttle * radius * 0.42 * VEHICLE_SPEED_BALANCE * deltaTime);
        } else {
            vehicle.velocity.multiplyScalar(Math.exp(-drag * deltaTime));
        }

        if (input.jump && vehicle.grounded && !vehicle.jumpHeld) {
            vehicle.verticalVelocity = radius * 0.72;
            vehicle.grounded = false;
            vehicle.jumpHeld = true;
        }
        if (!input.jump) vehicle.jumpHeld = false;

        this.projectVelocityOntoTangent(vehicle.velocity, normal);
        const speed = vehicle.velocity.length();
        const limit = throttle < 0 ? reverseLimit : maxSpeed;
        if (speed > limit) vehicle.velocity.multiplyScalar(limit / speed);
        if (vehicle.grounded && input.handbrake) vehicle.velocity.multiplyScalar(Math.exp(-brake * 0.016 * deltaTime));

        const effectiveRadius = Math.max(1, vehicle.localPosition.distanceTo(center));
        vehicle.localPosition.addScaledVector(vehicle.velocity, deltaTime);
        const newNormal = vehicle.localPosition.clone().sub(center).normalize();
        const correctedSurface = radius + this.getSurfaceHeight(newNormal) + vehicle.scale * 0.38 + Math.max(0, vehicle.verticalOffset || 0);
        if (vehicle.grounded) vehicle.localPosition.copy(center).addScaledVector(newNormal, correctedSurface);
        vehicle.normal.copy(newNormal);
        this.projectDirectionOntoTangent(vehicle.forward, newNormal, this.tangentFromNormal(newNormal));
        this.projectVelocityOntoTangent(vehicle.velocity, newNormal);

        this.alignVehicle(vehicle, deltaTime);
        this.animateWheels(vehicle, deltaTime);
        vehicle.speed = vehicle.velocity.length();
        vehicle.altitude = Math.max(0, vehicle.localPosition.distanceTo(center) - radius - this.getSurfaceHeight(newNormal));
        return effectiveRadius;
    }

    getSurfaceHeight(normal) {
        const height = this.getPlanetSurfaceHeight(normal) || 0;
        return Number.isFinite(height) ? height : 0;
    }

    alignVehicle(vehicle, deltaTime) {
        const right = this.tmpVecA.crossVectors(vehicle.forward, vehicle.normal).normalize();
        const forward = this.tmpVecB.crossVectors(vehicle.normal, right).normalize();
        const matrix = new this.THREE.Matrix4().makeBasis(right, vehicle.normal, forward.clone().multiplyScalar(-1));
        const targetQuat = new this.THREE.Quaternion().setFromRotationMatrix(matrix);
        vehicle.group.position.copy(vehicle.localPosition);
        if (deltaTime <= 0) vehicle.group.quaternion.copy(targetQuat);
        else vehicle.group.quaternion.slerp(targetQuat, smoothFactor(14, deltaTime));
    }

    animateWheels(vehicle, deltaTime) {
        const spin = (vehicle.speed || 0) * deltaTime / Math.max(0.001, vehicle.scale * 0.24);
        const frontWheels = new Set(vehicle.parts?.frontWheels || []);
        vehicle.parts?.wheels?.forEach((wheel) => {
            wheel.rotation.x -= spin;
            if (frontWheels.has(wheel)) wheel.rotation.y = clamp((vehicle.input?.right || 0) * 0.42, -0.42, 0.42);
        });
        if (vehicle.parts?.body) {
            vehicle.parts.body.rotation.z = Math.sin(performance.now() * 0.014) * clamp((vehicle.speed || 0) / 28, 0, 0.055);
        }
    }

    projectDirectionOntoTangent(vector, normal, fallback) {
        vector.addScaledVector(normal, -vector.dot(normal));
        if (vector.lengthSq() < EPSILON && fallback?.lengthSq?.() > EPSILON) {
            vector.copy(fallback).addScaledVector(normal, -fallback.dot(normal));
        }
        if (vector.lengthSq() < EPSILON) {
            vector.copy(this.tangentFromNormal(normal));
        }
        return vector.normalize();
    }

    projectVelocityOntoTangent(velocity, normal) {
        velocity.addScaledVector(normal, -velocity.dot(normal));
        if (velocity.lengthSq() < EPSILON) velocity.set(0, 0, 0);
        return velocity;
    }

    tangentFromNormal(normal) {
        const helper = Math.abs(normal.y) > 0.86 ? this.tmpVecC.set(1, 0, 0) : this.tmpVecC.set(0, 1, 0);
        return new this.THREE.Vector3().crossVectors(helper, normal).normalize();
    }
}
