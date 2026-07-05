import * as THREE from 'three';
import { MAP } from '../config.js';
import { createGrassTexture, createDirtTexture } from './textures.js';

// Builds the ground, dirt path, base/spawn markers, decorative trees, and
// exposes grid <-> world helpers plus buildability checks for the placement
// system.
export class MapBuilder {
  constructor(scene) {
    this.scene = scene;
    this.cols = MAP.cols;
    this.rows = MAP.rows;
    this.tileSize = MAP.tileSize;

    this.pathCells = new Set(); // "col,row" strings
    this.blockedCells = new Set(); // trees / decoration
    this.occupiedCells = new Set(); // towers

    this.worldWaypoints = MAP.waypoints.map(([c, r]) => this.gridToWorld(c, r));

    this._computePathCells();
    this._buildGround();
    this._buildPath();
    this._buildMarkers();
    this._scatterTrees();
  }

  gridToWorld(col, row) {
    return new THREE.Vector3(
      (col - this.cols / 2 + 0.5) * this.tileSize,
      0,
      (row - this.rows / 2 + 0.5) * this.tileSize
    );
  }

  worldToGrid(point) {
    return {
      col: Math.floor(point.x / this.tileSize + this.cols / 2),
      row: Math.floor(point.z / this.tileSize + this.rows / 2),
    };
  }

  inBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  isBuildable(col, row) {
    const key = `${col},${row}`;
    return (
      this.inBounds(col, row) &&
      !this.pathCells.has(key) &&
      !this.blockedCells.has(key) &&
      !this.occupiedCells.has(key)
    );
  }

  occupy(col, row) {
    this.occupiedCells.add(`${col},${row}`);
  }

  release(col, row) {
    this.occupiedCells.delete(`${col},${row}`);
  }

  _computePathCells() {
    const wp = MAP.waypoints;
    for (let i = 0; i < wp.length - 1; i++) {
      let [c0, r0] = wp[i];
      const [c1, r1] = wp[i + 1];
      const dc = Math.sign(c1 - c0);
      const dr = Math.sign(r1 - r0);
      while (c0 !== c1 || r0 !== r1) {
        if (this.inBounds(c0, r0)) this.pathCells.add(`${c0},${r0}`);
        c0 += dc;
        r0 += dr;
      }
      if (this.inBounds(c1, r1)) this.pathCells.add(`${c1},${r1}`);
    }
  }

  _buildGround() {
    const w = this.cols * this.tileSize;
    const h = this.rows * this.tileSize;

    const grass = createGrassTexture();
    grass.repeat.set(this.cols / 2, this.rows / 2);

    // Main play-area ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.groundMesh = ground;

    // Larger apron below so the world doesn't end abruptly at the grid edge
    const apronGrass = createGrassTexture();
    apronGrass.repeat.set(24, 24);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 4, h * 4),
      new THREE.MeshStandardMaterial({ map: apronGrass, roughness: 1, color: 0xb9ccb0 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.05;
    apron.receiveShadow = true;
    this.scene.add(apron);

    // Subtle grid lines over the buildable area
    const grid = new THREE.GridHelper(Math.max(w, h), Math.max(this.cols, this.rows), 0x2f4a28, 0x2f4a28);
    grid.material.transparent = true;
    grid.material.opacity = 0.15;
    grid.position.y = 0.02;
    grid.scale.set(w / Math.max(w, h), 1, h / Math.max(w, h));
    this.scene.add(grid);
  }

  _buildPath() {
    const dirt = createDirtTexture();
    const mat = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 });
    const geo = new THREE.PlaneGeometry(this.tileSize, this.tileSize);

    for (const key of this.pathCells) {
      const [c, r] = key.split(',').map(Number);
      const tile = new THREE.Mesh(geo, mat);
      tile.rotation.x = -Math.PI / 2;
      const pos = this.gridToWorld(c, r);
      tile.position.set(pos.x, 0.03, pos.z);
      tile.receiveShadow = true;
      this.scene.add(tile);
    }
  }

  _buildMarkers() {
    // Spawn portal at path start
    const spawn = this.worldWaypoints[0].clone();
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.18, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0x9b59d0, emissive: 0x5a2a8a, emissiveIntensity: 0.6 })
    );
    portal.position.set(spawn.x, 1.2, spawn.z);
    portal.rotation.y = Math.PI / 2;
    portal.castShadow = true;
    this.scene.add(portal);

    // Player base at path end: a small keep
    const end = this.worldWaypoints[this.worldWaypoints.length - 1].clone();
    const base = new THREE.Group();

    const keep = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.9 })
    );
    keep.position.y = 1.1;
    keep.castShadow = true;
    base.add(keep);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 })
    );
    roof.position.y = 2.8;
    roof.castShadow = true;
    base.add(roof);

    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    flagPole.position.y = 4.0;
    base.add(flagPole);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf4c542, side: THREE.DoubleSide })
    );
    flag.position.set(0.35, 4.3, 0);
    base.add(flag);

    base.position.set(end.x, 0, end.z);
    this.scene.add(base);
    this.baseGroup = base;
  }

  _scatterTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d7a35, roughness: 1 });

    let placed = 0;
    let attempts = 0;
    while (placed < MAP.treeCount && attempts < 300) {
      attempts++;
      const col = Math.floor(Math.random() * this.cols);
      const row = Math.floor(Math.random() * this.rows);
      if (!this.isBuildable(col, row)) continue;
      // keep tiles adjacent to the path clear for towers
      let nearPath = false;
      for (let dc = -1; dc <= 1 && !nearPath; dc++) {
        for (let dr = -1; dr <= 1 && !nearPath; dr++) {
          if (this.pathCells.has(`${col + dc},${row + dr}`)) nearPath = true;
        }
      }
      if (nearPath) continue;

      this.blockedCells.add(`${col},${row}`);
      const pos = this.gridToWorld(col, row);
      const tree = new THREE.Group();
      const scale = 0.8 + Math.random() * 0.5;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.7), trunkMat);
      trunk.position.y = 0.35;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 7), leafMat);
      leaves.position.y = 1.3;
      leaves.castShadow = true;
      tree.add(leaves);

      tree.scale.setScalar(scale);
      tree.position.set(pos.x + (Math.random() - 0.5) * 0.4, 0, pos.z + (Math.random() - 0.5) * 0.4);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
      placed++;
    }
  }
}
