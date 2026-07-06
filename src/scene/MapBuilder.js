import * as THREE from 'three';
import { THEMES } from '../config/maps.js';
import { createGroundTexture, createPathTexture, createSoftCircleTexture } from './textures.js';

// Builds one map from a map definition: ground, blended path, base/spawn
// markers, themed decorations, ambient environment (clouds), and exposes
// grid <-> world helpers plus buildability checks. Call update(dt) each frame
// for ambient animation (portal swirl, tree sway, cloud drift, flag wobble).
export class MapBuilder {
  static PLATFORM_HEIGHT = 1.1; // world-space height of elevated sniper zones

  constructor(scene, mapDef) {
    this.scene = scene;
    this.mapDef = mapDef;
    this.theme = THEMES[mapDef.theme];
    this.cols = mapDef.cols;
    this.rows = mapDef.rows;
    this.tileSize = mapDef.tileSize;

    this.pathCells = new Set(); // "col,row" strings
    this.blockedCells = new Set(); // decorations
    this.occupiedCells = new Set(); // towers
    this.elevatedCells = new Set((mapDef.elevatedZones || []).map(([c, r]) => `${c},${r}`));

    this.time = 0;
    this.trees = []; // { group, phase } for sway animation
    this.clouds = [];

    this.worldWaypoints = mapDef.waypoints.map(([c, r]) => this.gridToWorld(c, r));

    this._computePathCells();
    this._buildGround();
    this._buildPath();
    this._buildMarkers();
    this._buildElevatedZones();
    this._scatterDecorations();
    this._buildClouds();
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
      !this.occupiedCells.has(key) &&
      !this.elevatedCells.has(key)
    );
  }

  isElevated(col, row) {
    return this.elevatedCells.has(`${col},${row}`);
  }

  // Placement rule per tower kind: elevated-only towers go exclusively on
  // elevated platforms; everything else uses normal ground rules.
  canPlaceType(col, row, towerCfg) {
    if (towerCfg && towerCfg.elevatedOnly) {
      return this.isElevated(col, row) && !this.occupiedCells.has(`${col},${row}`);
    }
    return this.isBuildable(col, row);
  }

  // World-space y a tower base should sit at for this cell.
  placementHeight(col, row) {
    return this.isElevated(col, row) ? MapBuilder.PLATFORM_HEIGHT : 0;
  }

  occupy(col, row) {
    this.occupiedCells.add(`${col},${row}`);
  }

  release(col, row) {
    this.occupiedCells.delete(`${col},${row}`);
  }

  _computePathCells() {
    const wp = this.mapDef.waypoints;
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

    const groundTex = createGroundTexture(this.theme);
    groundTex.repeat.set(this.cols / 2, this.rows / 2);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.groundMesh = ground;

    // apron world beyond the play grid
    const apronTex = createGroundTexture(this.theme);
    apronTex.repeat.set(24, 24);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 4, h * 4),
      new THREE.MeshStandardMaterial({ map: apronTex, roughness: 1, color: this.theme.apronTint })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.05;
    apron.receiveShadow = true;
    this.scene.add(apron);

    // subtle build-grid lines
    const grid = new THREE.GridHelper(Math.max(w, h), Math.max(this.cols, this.rows), 0x223a1e, 0x223a1e);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.position.y = 0.02;
    grid.scale.set(w / Math.max(w, h), 1, h / Math.max(w, h));
    this.scene.add(grid);
  }

  _buildPath() {
    const pathTex = createPathTexture(this.theme);

    // alpha map fading at the tile rim so overlapping tiles blend softly
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = alphaCanvas.height = 128;
    const ctx = alphaCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 34, 64, 64, 64);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.75, '#ffffff');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const alphaMap = new THREE.CanvasTexture(alphaCanvas);

    const mat = new THREE.MeshStandardMaterial({
      map: pathTex,
      roughness: 1,
      transparent: true,
      alphaMap,
      depthWrite: false,
    });
    // oversized tiles overlap their neighbours, hiding the square grid look
    const geo = new THREE.PlaneGeometry(this.tileSize * 1.35, this.tileSize * 1.35);

    let order = 1;
    for (const key of this.pathCells) {
      const [c, r] = key.split(',').map(Number);
      const tile = new THREE.Mesh(geo, mat);
      tile.rotation.x = -Math.PI / 2;
      const pos = this.gridToWorld(c, r);
      tile.position.set(pos.x, 0.03, pos.z);
      tile.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2); // vary texture orientation
      tile.receiveShadow = true;
      tile.renderOrder = order++;
      this.scene.add(tile);
    }
  }

  _buildMarkers() {
    // spawn portal
    const spawn = this.worldWaypoints[0].clone();
    this.portal = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.16, 12, 32),
      new THREE.MeshStandardMaterial({ color: 0x9b59d0, emissive: 0x7a35c0, emissiveIntensity: 1.4 })
    );
    this.portalRing = ring;
    this.portal.add(ring);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.07, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xc98af0, emissive: 0xb060e8, emissiveIntensity: 1.8 })
    );
    this.portalInner = innerRing;
    this.portal.add(innerRing);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0x2a0a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    this.portal.add(disc);

    this.portal.position.set(spawn.x, 1.3, spawn.z);
    this.portal.rotation.y = Math.PI / 2;
    ring.castShadow = true;
    this.scene.add(this.portal);

    // player base keep
    const end = this.worldWaypoints[this.worldWaypoints.length - 1].clone();
    const base = new THREE.Group();

    const stone = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.9 });
    const keep = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 2.2, 10), stone);
    keep.position.y = 1.1;
    keep.castShadow = true;
    base.add(keep);

    // battlements
    for (let i = 0; i < 6; i++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), stone);
      const a = (i / 6) * Math.PI * 2;
      merlon.position.set(Math.cos(a) * 1.0, 2.35, Math.sin(a) * 1.0);
      merlon.castShadow = true;
      base.add(merlon);
    }

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 1.1, 10),
      new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 })
    );
    roof.position.y = 3.0;
    roof.castShadow = true;
    base.add(roof);

    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    flagPole.position.y = 4.1;
    base.add(flagPole);

    this.flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf4c542, side: THREE.DoubleSide, emissive: 0x6a5210, emissiveIntensity: 0.3 })
    );
    this.flag.position.set(0.35, 4.4, 0);
    base.add(this.flag);

    base.position.set(end.x, 0, end.z);
    this.scene.add(base);
    this.baseGroup = base;
  }

  // Raised stone platforms that only sniper towers can build on.
  _buildElevatedZones() {
    const h = MapBuilder.PLATFORM_HEIGHT;
    const stone = new THREE.MeshStandardMaterial({ color: 0x99a3b0, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x6e7885, roughness: 0.9 });
    const s = this.tileSize;

    for (const key of this.elevatedCells) {
      const [c, r] = key.split(',').map(Number);
      const pos = this.gridToWorld(c, r);
      const group = new THREE.Group();

      const body = new THREE.Mesh(new THREE.BoxGeometry(s * 0.92, h, s * 0.92), stone);
      body.position.y = h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(s * 1.0, 0.12, s * 1.0), trim);
      cap.position.y = h + 0.06;
      cap.receiveShadow = true;
      group.add(cap);

      // corner posts so the platform reads as a built structure
      for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), trim);
        post.position.set(dx * s * 0.42, h + 0.25, dz * s * 0.42);
        post.castShadow = true;
        group.add(post);
      }

      group.position.set(pos.x, 0, pos.z);
      this.scene.add(group);
    }
  }

  _scatterDecorations() {
    const theme = this.mapDef.theme;
    let placed = 0;
    let attempts = 0;
    while (placed < this.mapDef.decorationCount && attempts < 400) {
      attempts++;
      const col = Math.floor(Math.random() * this.cols);
      const row = Math.floor(Math.random() * this.rows);
      if (!this.isBuildable(col, row)) continue;
      // keep tiles adjacent to the path free for towers
      let nearPath = false;
      for (let dc = -1; dc <= 1 && !nearPath; dc++) {
        for (let dr = -1; dr <= 1 && !nearPath; dr++) {
          if (this.pathCells.has(`${col + dc},${row + dr}`)) nearPath = true;
        }
      }
      if (nearPath) continue;

      this.blockedCells.add(`${col},${row}`);
      const pos = this.gridToWorld(col, row);
      const deco = theme === 'desert' && Math.random() < 0.45
        ? this._makeRock(0xb08d62)
        : theme === 'desert'
          ? this._makeCactus()
          : theme === 'snow' && Math.random() < 0.3
            ? this._makeRock(0x9fb2c4)
            : this._makeTree(theme === 'snow');

      deco.position.set(pos.x + (Math.random() - 0.5) * 0.4, 0, pos.z + (Math.random() - 0.5) * 0.4);
      deco.rotation.y = Math.random() * Math.PI * 2;
      deco.scale.setScalar(0.8 + Math.random() * 0.5);
      this.scene.add(deco);
      placed++;
    }
  }

  _makeTree(snowy) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 })
    );
    trunk.position.y = 0.35;
    trunk.castShadow = true;
    tree.add(trunk);

    const leafColor = snowy ? 0x4a7060 : 0x3d7a35;
    for (let tier = 0; tier < 3; tier++) {
      const r = 0.65 - tier * 0.16;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, 0.7, 7),
        new THREE.MeshStandardMaterial({ color: leafColor, roughness: 1 })
      );
      cone.position.y = 0.85 + tier * 0.45;
      cone.castShadow = true;
      tree.add(cone);
      if (snowy) {
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.85, 0.25, 7),
          new THREE.MeshStandardMaterial({ color: 0xeef3f8, roughness: 1 })
        );
        cap.position.y = cone.position.y + 0.28;
        tree.add(cap);
      }
    }
    this.trees.push({ group: tree, phase: Math.random() * Math.PI * 2 });
    return tree;
  }

  _makeCactus() {
    const cactus = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4d8a4a, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 8), mat);
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    cactus.add(trunk);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), mat);
    arm.position.set(0.34, 0.9, 0);
    arm.rotation.z = -0.5;
    arm.castShadow = true;
    cactus.add(arm);
    this.trees.push({ group: cactus, phase: Math.random() * Math.PI * 2 });
    return cactus;
  }

  _makeRock(color) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })
    );
    rock.position.y = 0.25;
    rock.scale.y = 0.7;
    rock.castShadow = true;
    const g = new THREE.Group();
    g.add(rock);
    return g;
  }

  _buildClouds() {
    const tex = createSoftCircleTexture();
    for (let i = 0; i < 7; i++) {
      const group = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffs; p++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
        );
        sprite.position.set((p - puffs / 2) * 1.6 + Math.random(), (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5);
        sprite.scale.setScalar(2.5 + Math.random() * 2.5);
        group.add(sprite);
      }
      group.position.set(
        (Math.random() - 0.5) * 70,
        14 + Math.random() * 8,
        (Math.random() - 0.5) * 55
      );
      this.scene.add(group);
      this.clouds.push({ group, speed: 0.3 + Math.random() * 0.5 });
    }
  }

  // ambient animation, called once per frame
  update(dt) {
    this.time += dt;

    this.portalRing.rotation.z += dt * 0.8;
    this.portalInner.rotation.z -= dt * 1.6;
    this.portal.position.y = 1.3 + Math.sin(this.time * 1.5) * 0.08;

    this.flag.rotation.y = Math.sin(this.time * 4) * 0.35;
    this.flag.scale.x = 1 + Math.sin(this.time * 8) * 0.06;

    for (const { group, phase } of this.trees) {
      group.rotation.z = Math.sin(this.time * 1.4 + phase) * 0.03;
    }

    for (const cloud of this.clouds) {
      cloud.group.position.x += cloud.speed * dt;
      if (cloud.group.position.x > 45) cloud.group.position.x = -45;
    }
  }
}
