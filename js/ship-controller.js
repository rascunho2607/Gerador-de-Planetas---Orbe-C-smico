const EPSILON = 0.000001;
const SHIP_MAX_ROLL = Math.PI * 0.21;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothFactor(speed, deltaTime) {
    return 1 - Math.exp(-Math.max(0.001, speed) * Math.max(0, deltaTime || 0));
}

function isFiniteVector(vector) {
    return Boolean(vector && Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z));
}

export class ShipController {
    constructor({ THREE, scene, surfaceGroup, cosmicGroup, getPlanetRadius, getPlanetCenter, getPlanetSurfaceHeight }) {
        this.THREE = THREE;
        this.scene = scene;
        this.surfaceGroup = surfaceGroup;
        this.cosmicGroup = cosmicGroup;
        this.getPlanetRadius = getPlanetRadius;
        this.getPlanetCenter = getPlanetCenter;
        this.getPlanetSurfaceHeight = getPlanetSurfaceHeight;
        this.tmpVecA = new THREE.Vector3();
        this.tmpVecB = new THREE.Vector3();
        this.tmpVecC = new THREE.Vector3();
        this.tmpQuat = new THREE.Quaternion();
        this.tmpMatrix = new THREE.Matrix4();
    }

    update(vehicle, deltaTime, input, cameraForward) {
        const shipInput = this.getShipInput(input);
        if (vehicle.landed) {
            this.updateLandedShip(vehicle, deltaTime, shipInput, cameraForward);
        } else {
            this.updateFlyingShip(vehicle, deltaTime, shipInput, cameraForward);
        }
        this.updateThrusters(vehicle, shipInput);
    }

    getShipInput(input = {}) {
        return {
            throttle: Number(input.shipThrottle ?? input.throttle ?? 0),
            brake: Number(input.shipBrake ?? input.brake ?? 0),
            boost: Boolean(input.shipBoost ?? input.boost),
            vertical: Number(input.shipVertical ?? input.vertical ?? 0),
            roll: Number(input.shipRoll ?? input.roll ?? 0)
        };
    }

    updateLandedShip(vehicle, deltaTime, input, cameraForward) {
        const normal = vehicle.localPosition.clone().sub(this.getPlanetCenter()).normalize();
        vehicle.normal.copy(normal);
        this.projectOntoTangent(vehicle.forward, normal, this.tangentFromNormal(normal));
        if (input.vertical > 0 || input.throttle > 0 || input.boost) {
            this.takeOff(vehicle, cameraForward);
            return;
        }
        this.alignLocalVehicle(vehicle, deltaTime);
        vehicle.speed = 0;
        vehicle.altitude = 0;
        if (cameraForward?.lengthSq?.() > EPSILON) {
            const desired = this.worldDirectionToLocal(cameraForward, this.tmpVecA);
            this.projectOntoTangent(desired, normal, vehicle.forward);
            vehicle.forward.lerp(desired, smoothFactor(5.3, deltaTime)).normalize();
        }
    }

    updateFlyingShip(vehicle, deltaTime, input, cameraForward) {
        const radius = this.getPlanetRadius();
        const planetCenterWorld = this.getWorldPlanetCenter(this.tmpVecA).clone();
        const shipPosition = vehicle.group.getWorldPosition(this.tmpVecB);
        const toShip = shipPosition.clone().sub(planetCenterWorld);
        const distance = Math.max(0.001, toShip.length());
        const gravityNormal = toShip.clone().normalize();
        const nearPlanet = distance < radius * 6.5;

        vehicle.flightTime = (vehicle.flightTime || 0) + deltaTime;
        vehicle.takeoffCooldown = Math.max(0, (vehicle.takeoffCooldown || 0) - deltaTime);

        if (!this.ensureWorldOrientation(vehicle, gravityNormal)) return;

        const desiredForward = cameraForward?.lengthSq?.() > EPSILON ? cameraForward.clone().normalize() : vehicle.forwardWorld.clone();
        vehicle.forwardWorld.lerp(desiredForward, smoothFactor(2.8, deltaTime)).normalize();
        const referenceUp = nearPlanet ? gravityNormal : vehicle.upWorld;
        this.rebuildStableFrame(vehicle, referenceUp);
        this.updateRoll(vehicle, deltaTime, input.roll || 0);

        const maxSpeed = radius * 4.2;
        const boostMaxSpeed = radius * 7.0;
        const thrust = radius * 2.8;
        const boostThrust = radius * 5.5;
        const brakeForce = radius * 3.5;
        const reverseThrust = radius * 1.0;
        const verticalThrust = radius * 2.4;
        const drag = 0.22;
        const noForwardInputDrag = 0.38;
        const speedLimit = input.boost ? boostMaxSpeed : maxSpeed;
        vehicle.maxSpeed = speedLimit;

        const verticalAxis = nearPlanet ? gravityNormal : vehicle.upWorld;
        if (input.throttle > 0) {
            vehicle.velocity.addScaledVector(vehicle.forwardWorld, thrust * input.throttle * deltaTime);
        }
        if (input.boost) {
            vehicle.velocity.addScaledVector(vehicle.forwardWorld, boostThrust * deltaTime);
        }
        if (input.brake > 0) {
            const forwardSpeed = vehicle.velocity.dot(vehicle.forwardWorld);
            if (forwardSpeed > 0.5) {
                const brakeStep = Math.min(forwardSpeed, brakeForce * input.brake * deltaTime);
                vehicle.velocity.addScaledVector(vehicle.forwardWorld, -brakeStep);
            } else {
                vehicle.velocity.addScaledVector(vehicle.forwardWorld, -reverseThrust * input.brake * deltaTime);
            }
        }
        if (Math.abs(input.vertical) > EPSILON) {
            vehicle.velocity.addScaledVector(verticalAxis, clamp(input.vertical, -1, 1) * verticalThrust * deltaTime);
        }

        if (nearPlanet) {
            const gravity = radius * 0.25 / Math.max(0.4, Math.pow(distance / radius, 1.35));
            vehicle.velocity.addScaledVector(gravityNormal, -gravity * deltaTime);
        }

        if (vehicle.velocity.length() > speedLimit) vehicle.velocity.setLength(speedLimit);
        const hasForwardInput = input.throttle > 0 || input.boost;
        vehicle.velocity.multiplyScalar(Math.exp(-(hasForwardInput ? drag : noForwardInputDrag) * deltaTime));
        vehicle.group.position.addScaledVector(vehicle.velocity, deltaTime);

        const newShipPosition = vehicle.group.getWorldPosition(this.tmpVecB);
        const newOffset = newShipPosition.clone().sub(planetCenterWorld);
        const newDistance = Math.max(0.001, newOffset.length());
        const newNormal = newOffset.normalize();
        const surfaceHeight = this.getSurfaceHeight(newNormal);
        const landingRadius = radius + surfaceHeight + vehicle.scale * 0.52;
        const altitude = newDistance - landingRadius;
        const radialVelocity = vehicle.velocity.dot(newNormal);
        const landingThreshold = vehicle.scale * 0.75;
        const safeLandingDescentSpeed = radius * 0.035;
        const maxLandingSpeed = radius * 0.9;

        this.alignWorldVehicle(vehicle, deltaTime);
        vehicle.speed = vehicle.velocity.length();
        vehicle.altitude = Math.max(0, newDistance - radius - surfaceHeight);

        if (
            vehicle.takeoffCooldown <= 0 &&
            altitude <= landingThreshold &&
            radialVelocity < -safeLandingDescentSpeed &&
            vehicle.velocity.length() < maxLandingSpeed
        ) {
            this.landOnPlanet(vehicle, newNormal);
        } else if (newDistance < landingRadius) {
            vehicle.velocity.addScaledVector(newNormal, radius * 2.4 * deltaTime);
            vehicle.group.position.addScaledVector(newNormal, landingRadius - newDistance);
        }
    }

    takeOff(vehicle, cameraForward) {
        if (!vehicle.landed) return;
        const worldPosition = vehicle.group.getWorldPosition(new this.THREE.Vector3());
        const worldQuaternion = vehicle.group.getWorldQuaternion(new this.THREE.Quaternion());
        this.cosmicGroup.add(vehicle.group);
        vehicle.group.position.copy(this.cosmicGroup.worldToLocal(worldPosition));
        vehicle.group.quaternion.copy(worldQuaternion);
        vehicle.landed = false;
        vehicle.takeoffCooldown = 1.2;
        vehicle.flightTime = 0;
        vehicle.upWorld.copy(vehicle.normal).transformDirection(this.surfaceGroup.matrixWorld).normalize();
        const desiredForward = cameraForward?.lengthSq?.() > EPSILON
            ? cameraForward.clone().normalize()
            : vehicle.forward.clone().transformDirection(this.surfaceGroup.matrixWorld).normalize();
        desiredForward.addScaledVector(vehicle.upWorld, -desiredForward.dot(vehicle.upWorld));
        if (desiredForward.lengthSq() < EPSILON) {
            desiredForward.copy(vehicle.forward).transformDirection(this.surfaceGroup.matrixWorld).normalize();
        }
        vehicle.forwardWorld.copy(desiredForward.normalize());
        this.rebuildStableFrame(vehicle, vehicle.upWorld);
        vehicle.rollAngle = 0;
        vehicle.rollVelocity = 0;
        vehicle.velocity.set(0, 0, 0)
            .addScaledVector(vehicle.upWorld, this.getPlanetRadius() * 1.4);
    }

    landOnPlanet(vehicle, normalWorld) {
        const localNormal = this.worldDirectionToLocal(normalWorld, this.tmpVecA).normalize();
        const center = this.getPlanetCenter();
        const radius = this.getPlanetRadius() + this.getSurfaceHeight(localNormal) + vehicle.scale * 0.52;
        const localPosition = center.clone().addScaledVector(localNormal, radius);
        const forwardLocal = this.worldDirectionToLocal(vehicle.forwardWorld, this.tmpVecB);
        this.projectOntoTangent(forwardLocal, localNormal, this.tangentFromNormal(localNormal));

        this.surfaceGroup.add(vehicle.group);
        vehicle.localPosition.copy(localPosition);
        vehicle.group.position.copy(localPosition);
        vehicle.normal.copy(localNormal);
        vehicle.forward.copy(forwardLocal);
        vehicle.velocity.set(0, 0, 0);
        vehicle.rollAngle = 0;
        vehicle.rollVelocity = 0;
        vehicle.landed = true;
        this.alignLocalVehicle(vehicle, 0);
    }

    alignLocalVehicle(vehicle, deltaTime) {
        const right = this.tmpVecA.crossVectors(vehicle.forward, vehicle.normal).normalize();
        const forward = this.tmpVecB.crossVectors(vehicle.normal, right).normalize();
        const matrix = new this.THREE.Matrix4().makeBasis(right, vehicle.normal, forward.clone().multiplyScalar(-1));
        const targetQuat = new this.THREE.Quaternion().setFromRotationMatrix(matrix);
        vehicle.group.position.copy(vehicle.localPosition);
        if (deltaTime <= 0) vehicle.group.quaternion.copy(targetQuat);
        else vehicle.group.quaternion.slerp(targetQuat, smoothFactor(13, deltaTime));
        vehicle.group.updateMatrixWorld(true);
        vehicle.forwardWorld.copy(vehicle.forward).transformDirection(this.surfaceGroup.matrixWorld).normalize();
        vehicle.upWorld.copy(vehicle.normal).transformDirection(this.surfaceGroup.matrixWorld).normalize();
    }

    alignWorldVehicle(vehicle, deltaTime) {
        const right = this.tmpVecA.crossVectors(vehicle.forwardWorld, vehicle.upWorld).normalize();
        const up = this.tmpVecB.crossVectors(right, vehicle.forwardWorld).normalize();
        if (Number.isFinite(vehicle.rollAngle) && Math.abs(vehicle.rollAngle) > EPSILON) {
            right.applyAxisAngle(vehicle.forwardWorld, vehicle.rollAngle).normalize();
            up.applyAxisAngle(vehicle.forwardWorld, vehicle.rollAngle).normalize();
        }
        const matrix = new this.THREE.Matrix4().makeBasis(right, up, vehicle.forwardWorld.clone().multiplyScalar(-1));
        const targetQuat = new this.THREE.Quaternion().setFromRotationMatrix(matrix);
        if (deltaTime <= 0) vehicle.group.quaternion.copy(targetQuat);
        else vehicle.group.quaternion.slerp(targetQuat, smoothFactor(13.5, deltaTime));
    }

    ensureWorldOrientation(vehicle, fallbackUp) {
        if (isFiniteVector(vehicle.forwardWorld) && vehicle.forwardWorld.lengthSq() > EPSILON &&
            isFiniteVector(vehicle.upWorld) && vehicle.upWorld.lengthSq() > EPSILON) {
            vehicle.forwardWorld.normalize();
            vehicle.upWorld.normalize();
            return true;
        }
        vehicle.forwardWorld.set(0, 0, -1);
        vehicle.upWorld.copy(fallbackUp?.lengthSq?.() > EPSILON ? fallbackUp : new this.THREE.Vector3(0, 1, 0)).normalize();
        this.rebuildStableFrame(vehicle, vehicle.upWorld);
        vehicle.rollAngle = 0;
        vehicle.rollVelocity = 0;
        return true;
    }

    rebuildStableFrame(vehicle, referenceUp) {
        const forward = vehicle.forwardWorld;
        if (!isFiniteVector(forward) || forward.lengthSq() < EPSILON) forward.set(0, 0, -1);
        forward.normalize();

        const upReference = this.tmpVecB.copy(referenceUp);
        if (!isFiniteVector(upReference) || upReference.lengthSq() < EPSILON) upReference.set(0, 1, 0);
        upReference.normalize();

        const right = this.tmpVecC.crossVectors(forward, upReference);
        if (right.lengthSq() < EPSILON && vehicle.rightWorld?.lengthSq?.() > EPSILON) {
            right.copy(vehicle.rightWorld);
        }
        if (right.lengthSq() < EPSILON) {
            const helper = Math.abs(forward.y) > 0.86 ? this.tmpVecA.set(1, 0, 0) : this.tmpVecA.set(0, 1, 0);
            right.crossVectors(forward, helper);
        }
        right.normalize();

        if (!vehicle.rightWorld) vehicle.rightWorld = new this.THREE.Vector3();
        vehicle.rightWorld.copy(right);
        vehicle.upWorld.crossVectors(right, forward).normalize();
    }

    updateRoll(vehicle, deltaTime, rollInput) {
        const rollAccel = 2.4;
        const rollDamping = 4.5;
        vehicle.rollAngle = Number.isFinite(vehicle.rollAngle) ? vehicle.rollAngle : 0;
        vehicle.rollVelocity = Number.isFinite(vehicle.rollVelocity) ? vehicle.rollVelocity : 0;
        vehicle.rollVelocity += clamp(rollInput, -1, 1) * rollAccel * deltaTime;
        vehicle.rollVelocity *= Math.exp(-rollDamping * deltaTime);
        vehicle.rollAngle += vehicle.rollVelocity * deltaTime;
        if (Math.abs(rollInput) <= EPSILON) {
            vehicle.rollAngle += (0 - vehicle.rollAngle) * smoothFactor(2.5, deltaTime);
        }
        vehicle.rollAngle = clamp(vehicle.rollAngle, -SHIP_MAX_ROLL, SHIP_MAX_ROLL);
        if (Math.abs(vehicle.rollAngle) >= SHIP_MAX_ROLL && Math.sign(vehicle.rollVelocity) === Math.sign(vehicle.rollAngle)) {
            vehicle.rollVelocity = 0;
        }
    }

    updateThrusters(vehicle, input) {
        const intensity = Math.max(0.12, (input.throttle || 0) + (input.boost ? 0.8 : 0) + Math.abs(input.vertical || 0) * 0.18);
        vehicle.parts?.thrusters?.forEach((thruster) => {
            thruster.scale.z = 0.65 + intensity * 1.4 + Math.sin(performance.now() * 0.025) * 0.16;
            thruster.material.opacity = clamp(0.35 + intensity * 0.42, 0.3, 0.95);
        });
    }

    getSurfaceHeight(normal) {
        const height = this.getPlanetSurfaceHeight(normal) || 0;
        return Number.isFinite(height) ? height : 0;
    }

    getWorldPlanetCenter(target) {
        target.copy(this.getPlanetCenter());
        this.surfaceGroup.localToWorld(target);
        return target;
    }

    worldDirectionToLocal(direction, target) {
        this.tmpMatrix.copy(this.surfaceGroup.matrixWorld).invert();
        return target.copy(direction).transformDirection(this.tmpMatrix).normalize();
    }

    projectOntoTangent(vector, normal, fallback) {
        vector.addScaledVector(normal, -vector.dot(normal));
        if (vector.lengthSq() < EPSILON) vector.copy(fallback);
        return vector.normalize();
    }

    tangentFromNormal(normal) {
        const helper = Math.abs(normal.y) > 0.86 ? this.tmpVecC.set(1, 0, 0) : this.tmpVecC.set(0, 1, 0);
        return new this.THREE.Vector3().crossVectors(helper, normal).normalize();
    }
}
