import * as THREE from 'three';

const _toTarget = new THREE.Vector3();

// A real traveling projectile with per-frame collision checks (no hitscan).
// Homes toward its target; if the target dies mid-flight it continues to the
// last known position (splash shots still explode there).
export class Projectile {
  constructor(scene, origin, target, opts) {
    this.scene = scene;
    this.target = target;
    this.lastTargetPos = target.position.clone();
    this.lastTargetPos.y = target.body.getWorldPosition(new THREE.Vector3()).y;

    this.speed = opts.speed;
    this.damage = opts.damage;
    this.splashRadius = opts.splashRadius || 0;
    this.slowFactor = opts.slowFactor || null;
    this.slowDuration = opts.slowDuration || 0;
    this.life = 4; // failsafe expiry (seconds)
    this.done = false;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.size, 8, 6),
      new THREE.MeshStandardMaterial({
        color: opts.color,
        emissive: opts.color,
        emissiveIntensity: 0.8,
      })
    );
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

    // refresh homing point while the target lives
    if (this.target && this.target.alive) {
      this.lastTargetPos.copy(this.target.position);
      this.lastTargetPos.y = this.target.body.getWorldPosition(_toTarget).y;
    }

    _toTarget.subVectors(this.lastTargetPos, this.mesh.position);
    const dist = _toTarget.length();
    const step = this.speed * dt;

    const hitRadius = this.target && this.target.alive ? this.target.radius : 0.25;

    if (dist <= Math.max(step, hitRadius)) {
      // impact
      this.done = true;
      return {
        point: this.lastTargetPos.clone(),
        directTarget: this.target && this.target.alive ? this.target : null,
        damage: this.damage,
        splashRadius: this.splashRadius,
        slowFactor: this.slowFactor,
        slowDuration: this.slowDuration,
      };
    }

    _toTarget.normalize();
    this.mesh.position.addScaledVector(_toTarget, step);
    return null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
