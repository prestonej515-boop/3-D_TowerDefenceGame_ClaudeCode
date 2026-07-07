import * as THREE from 'three';
import { getModel } from '../systems/ModelLibrary.js';

const _toTarget = new THREE.Vector3();
const _lookAt = new THREE.Vector3();

// A real traveling projectile with per-frame collision checks (no hitscan).
// Homes toward its target; if the target dies mid-flight it continues to the
// last known position (splash shots still explode there). Carries a reference
// to its source tower so damage/kills can be attributed for the DPS meter.
export class Projectile {
  constructor(scene, origin, target, opts) {
    this.scene = scene;
    this.target = target;
    this.sourceTower = opts.sourceTower || null;
    this.color = opts.color;
    this.lastTargetPos = target.position.clone();
    this.lastTargetPos.y = target.body.getWorldPosition(new THREE.Vector3()).y;

    this.speed = opts.speed;
    this.damage = opts.damage;
    this.splashRadius = opts.splashRadius || 0;
    this.slowFactor = opts.slowFactor || null;
    this.slowDuration = opts.slowDuration || 0;
    this.burnDps = opts.burnDps || null;
    this.burnDuration = opts.burnDuration || 0;
    // ballistic arc (mortar): height driven by initial horizontal distance
    this.arc = !!opts.arc;
    if (this.arc) {
      this.originY = origin.y;
      const dx = this.lastTargetPos.x - origin.x;
      const dz = this.lastTargetPos.z - origin.z;
      this.initialDist = Math.max(Math.hypot(dx, dz), 0.001);
      this.arcHeight = Math.min(Math.max(this.initialDist * 0.4, 1.5), 4.5);
    }
    this.life = 6; // failsafe expiry (seconds; arcing shells fly longer)
    this.trailAcc = 0; // trail spawn accumulator (managed by TowerManager)
    this.done = false;

    // kit ammo model when the tower specifies one; glowing sphere otherwise
    // (Frost keeps the sphere — it reads as an ice orb and feeds the bloom)
    this.mesh = opts.ammo ? getModel(opts.ammo) : null;
    this._ownsGeometry = !this.mesh;
    if (this.mesh) {
      this.mesh.scale.setScalar(1.5);
      this.spin = opts.ammo.includes('boulder') || opts.ammo.includes('cannonball');
    } else {
      this.mesh = new THREE.Mesh(
        new THREE.SphereGeometry(opts.size, 8, 6),
        new THREE.MeshStandardMaterial({
          color: opts.color,
          emissive: opts.color,
          emissiveIntensity: 2.2, // bright enough to catch the bloom pass
        })
      );
    }
    this.mesh.position.copy(origin);
    scene.add(this.mesh);
  }

  // Returns an impact descriptor when it hits, null otherwise.
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.done = true;
      return null;
    }

    if (this.target && this.target.alive) {
      this.lastTargetPos.copy(this.target.position);
      this.lastTargetPos.y = this.target.body.getWorldPosition(_toTarget).y;
    }

    _toTarget.subVectors(this.lastTargetPos, this.mesh.position);
    if (this.arc) _toTarget.y = 0; // arc shells home horizontally; y is parametric
    const dist = _toTarget.length();
    const step = this.speed * dt;
    const hitRadius = this.target && this.target.alive ? this.target.radius : 0.25;

    if (dist <= Math.max(step, hitRadius)) {
      this.done = true;
      return {
        point: this.lastTargetPos.clone(),
        directTarget: this.target && this.target.alive ? this.target : null,
        sourceTower: this.sourceTower,
        damage: this.damage,
        splashRadius: this.splashRadius,
        slowFactor: this.slowFactor,
        slowDuration: this.slowDuration,
        burnDps: this.burnDps,
        burnDuration: this.burnDuration,
      };
    }

    _toTarget.normalize();
    this.mesh.position.addScaledVector(_toTarget, step);
    if (this.arc) {
      // parametric lob: remaining-distance fraction drives a sine arch
      const t = 1 - Math.min(dist / this.initialDist, 1);
      this.mesh.position.y =
        this.originY + (this.lastTargetPos.y - this.originY) * t + Math.sin(t * Math.PI) * this.arcHeight;
    }
    if (!this._ownsGeometry) {
      // orient kit ammo along its travel direction (matters for the arrow)
      _lookAt.copy(this.mesh.position).add(_toTarget);
      this.mesh.lookAt(_lookAt);
      if (this.spin) this.mesh.rotateX(dt * 14); // tumbling boulder/cannonball
    }
    return null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    if (this._ownsGeometry) {
      // only the procedural sphere owns its resources; kit ammo shares the
      // ModelLibrary cache
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
