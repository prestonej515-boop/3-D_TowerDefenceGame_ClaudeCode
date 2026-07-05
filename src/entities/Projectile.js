import * as THREE from 'three';

const _toTarget = new THREE.Vector3();

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
    this.life = 4; // failsafe expiry (seconds)
    this.trailAcc = 0; // trail spawn accumulator (managed by TowerManager)
    this.done = false;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.size, 8, 6),
      new THREE.MeshStandardMaterial({
        color: opts.color,
        emissive: opts.color,
        emissiveIntensity: 2.2, // bright enough to catch the bloom pass
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

    if (this.target && this.target.alive) {
      this.lastTargetPos.copy(this.target.position);
      this.lastTargetPos.y = this.target.body.getWorldPosition(_toTarget).y;
    }

    _toTarget.subVectors(this.lastTargetPos, this.mesh.position);
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
