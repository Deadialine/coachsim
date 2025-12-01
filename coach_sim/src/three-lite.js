export const MathUtils = {
  degToRad: (deg) => (deg * Math.PI) / 180,
};

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
}

class Euler {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

export class Color {
  constructor(value = 0xffffff) {
    if (typeof value === "string" && value.startsWith("#")) {
      this.value = parseInt(value.slice(1), 16);
    } else {
      this.value = value;
    }
  }
  getHex() {
    return this.value;
  }
}

class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Euler();
    this.children = [];
    this.visible = true;
  }
  add(child) {
    this.children.push(child);
    return this;
  }
}

export class Group extends Object3D {}
export class Scene extends Group {}

export class PerspectiveCamera extends Object3D {
  constructor(fov = 45, aspect = 1, near = 0.1, far = 1000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }
  lookAt() {}
  updateProjectionMatrix() {}
}

export class BoxGeometry {
  constructor(width = 1, height = 1, depth = 1) {
    this.width = width;
    this.height = height;
    this.depth = depth;
  }
}

export class MeshStandardMaterial {
  constructor({ color = 0xffffff, roughness = 0.5 } = {}) {
    this.color = color;
    this.roughness = roughness;
  }
}

export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

export class AmbientLight extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.color = color;
    this.intensity = intensity;
  }
}

export class DirectionalLight extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.color = color;
    this.intensity = intensity;
  }
}

export class GridHelper extends Object3D {
  constructor(size = 10, divisions = 10, color1 = 0xcccccc, color2 = 0xeeeeee) {
    super();
    this.size = size;
    this.divisions = divisions;
    this.color1 = color1;
    this.color2 = color2;
  }
}

function colorToCss(hex) {
  const c = hex.toString(16).padStart(6, "0");
  return `#${c}`;
}

export class WebGLRenderer {
  constructor({ alpha = false, antialias = false } = {}) {
    this.domElement = document.createElement("canvas");
    this.domElement.style.background = alpha ? "transparent" : "#f8fafc";
    this.ctx = this.domElement.getContext("2d");
    this._loop = null;
    this._frame = null;
  }
  setSize(w, h) {
    this.domElement.width = w;
    this.domElement.height = h;
  }
  setPixelRatio() {}
  render(scene, camera) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.domElement.width, this.domElement.height);
    ctx.save();
    ctx.translate(this.domElement.width / 2, this.domElement.height * 0.6);

    const scale = 60;
    const drawObject = (obj) => {
      if (!obj.visible) return;
      ctx.save();
      ctx.translate(obj.position.x * scale, -obj.position.y * scale + obj.position.z * 5);
      if (obj.rotation.z) ctx.rotate(obj.rotation.z);
      if (obj.rotation.x) ctx.scale(1, Math.cos(obj.rotation.x));
      if (obj.rotation.y) ctx.scale(Math.cos(obj.rotation.y), 1);

      if (obj instanceof Mesh) {
        const w = (obj.geometry?.width || 1) * scale;
        const h = (obj.geometry?.height || 1) * scale;
        ctx.fillStyle = colorToCss(obj.material?.color ?? 0x888888);
        ctx.strokeStyle = "rgba(15,23,42,0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 6);
        ctx.fill();
        ctx.stroke();
      }

      obj.children.forEach(drawObject);
      ctx.restore();
    };

    scene.children.forEach(drawObject);
    ctx.restore();
  }
  setAnimationLoop(fn) {
    if (this._frame) cancelAnimationFrame(this._frame);
    this._loop = fn;
    if (fn) {
      const tick = () => {
        this._frame = requestAnimationFrame(tick);
        fn();
      };
      this._frame = requestAnimationFrame(tick);
    }
  }
  dispose() {
    if (this._frame) cancelAnimationFrame(this._frame);
    this.ctx?.clearRect(0, 0, this.domElement.width, this.domElement.height);
  }
}

export default {
  MathUtils,
  Vector3,
  Euler,
  Color,
  Object3D,
  Group,
  Scene,
  PerspectiveCamera,
  BoxGeometry,
  MeshStandardMaterial,
  Mesh,
  AmbientLight,
  DirectionalLight,
  GridHelper,
  WebGLRenderer,
};
