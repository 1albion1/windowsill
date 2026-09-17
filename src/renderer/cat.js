import { STATES, pickNext, rollDuration, resolvePose } from './behavior.js';
import { deriveAutoScales, sampleMask } from './sprites.js';

const GRAVITY = 2400; // px/s^2
const TERMINAL_VELOCITY = 2800;
const AIR_DRAG = 0.6; // fraction of horizontal speed retained per second in the air
const GROUND_DRAG = 0.02; // fraction retained per second after a throw
const REST_SPEED = 12; // below this a thrown cat counts as settled
const EDGE_MARGIN = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Frame-rate independent exponential decay: keeps `retained` of the value per second. */
const decay = (value, retained, dt) => value * Math.pow(retained, dt);

export class Cat {
  constructor({ definition, poses, world, stage }) {
    this.definition = definition;
    this.poses = poses;
    this.world = world;
    this.height = definition.height;
    this.speedScale = definition.speed;
    this.poseScale = definition.poseScale ?? {};
    this.autoScale = deriveAutoScales(poses);
    this.faces = definition.faces ?? 'right';
    this.poseFaces = definition.poseFaces ?? {};

    const spawn = world.spawnPoint();
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.onGround = true;

    this.state = 'sit';
    this.stateTime = 0;
    this.stateDuration = rollDuration('sit');
    this.clock = Math.random() * 100; // desync animation phases between cats
    this.landSquash = 0;
    this.thrown = false;

    this.dragging = false;
    this.grabOffset = { x: 0, y: 0 };
    this.pointerTrail = [];

    this.element = document.createElement('div');
    this.element.className = 'cat';
    this.element.title = definition.name;

    this.art = document.createElement('img');
    this.art.className = 'cat__art';
    this.art.alt = '';
    this.art.draggable = false;
    this.element.append(this.art);

    this.shadow = document.createElement('div');
    this.shadow.className = 'cat-shadow';

    stage.append(this.shadow, this.element);

    this.box = { left: 0, top: 0, width: 0, height: 0 };
    this.pose = null;
    this.enterState('sit');
  }

  destroy() {
    this.element.remove();
    this.shadow.remove();
  }

  // -- state ---------------------------------------------------------------

  enterState(state) {
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = rollDuration(state);

    if (state === 'walk' || state === 'run') {
      // Commit to a direction for the whole stint rather than jittering.
      this.facing = Math.random() < 0.5 ? -1 : 1;
    }

    const pose = resolvePose(this.poses, state);
    if (pose && pose !== this.pose) {
      this.pose = pose;
      this.art.src = pose.url;
      this.art.style.transformOrigin = `${pose.content.centerX * 100}% ${pose.content.y1 * 100}%`;
    }

    this.element.classList.toggle('cat--asleep', state === 'sleep');
    this.element.classList.toggle('cat--held', state === 'held');
  }

  /** Nudged by the cursor passing close by. */
  wake() {
    if (this.state === 'sleep' || this.state === 'groom') this.enterState('idle');
  }

  // -- presentation helpers -------------------------------------------------

  /**
   * -1 when the sprite has to be mirrored. `facing` is where the cat is headed;
   * the pose's own `faces` is where the photograph already points. A left-facing
   * photo walking right is the case that needs the flip.
   */
  mirror() {
    const art = this.poseFaces[this.pose?.name] ?? this.faces;
    if (art === 'front') return 1; // head-on: flipping it only moves the collar
    return this.facing * (art === 'left' ? -1 : 1);
  }

  /** How tall this cat stands in its current pose. */
  standingHeight() {
    const name = this.pose?.name;
    return this.height * (this.poseScale[name] ?? this.autoScale[name] ?? 1);
  }

  // -- interaction ---------------------------------------------------------

  hitTest(px, py) {
    if (!this.pose) return false;
    const { left, top, width, height } = this.box;
    let u = (px - left) / width;
    const v = (py - top) / height;
    // The sprite is mirrored about its content centre, so undo that first.
    if (this.mirror() < 0) u = 2 * this.pose.content.centerX - u;
    return sampleMask(this.pose, u, v);
  }

  grab(px, py) {
    this.dragging = true;
    this.thrown = false;
    this.grabOffset = { x: this.x - px, y: this.y - py };
    this.pointerTrail = [{ x: px, y: py, t: performance.now() }];
    this.vx = 0;
    this.vy = 0;
    this.enterState('held');
  }

  dragTo(px, py) {
    if (!this.dragging) return;
    this.x = this.world.clampX(px + this.grabOffset.x, EDGE_MARGIN);
    this.y = py + this.grabOffset.y;
    this.onGround = false;

    const now = performance.now();
    this.pointerTrail.push({ x: px, y: py, t: now });
    while (this.pointerTrail.length > 2 && now - this.pointerTrail[0].t > 90) this.pointerTrail.shift();
  }

  release() {
    if (!this.dragging) return;
    this.dragging = false;

    // Throw velocity comes from the last ~90ms of pointer movement.
    const first = this.pointerTrail[0];
    const last = this.pointerTrail.at(-1);
    const seconds = first && last ? (last.t - first.t) / 1000 : 0;
    if (seconds > 0.008) {
      this.vx = clamp((last.x - first.x) / seconds, -2200, 2200);
      this.vy = clamp((last.y - first.y) / seconds, -2200, 2200);
    } else {
      this.vx = 0;
      this.vy = 0;
    }

    if (Math.abs(this.vx) > 40) this.facing = Math.sign(this.vx);
    this.thrown = true;
    this.enterState('fall');
  }

  /** A quick click rather than a drag: startle them into a little hop. */
  poke() {
    this.vy = -540;
    this.vx = this.facing * -90;
    this.onGround = false;
    this.thrown = false;
    this.landSquash = -0.14; // negative reads as stretch on the way up
    this.enterState('fall');
  }

  // -- simulation ----------------------------------------------------------

  update(dt, context) {
    this.clock += dt;
    this.landSquash = decay(this.landSquash, 0.0002, dt);

    if (!this.dragging) this.simulate(dt, context);
    this.render();
  }

  simulate(dt, context) {
    const config = STATES[this.state] ?? STATES.idle;

    if (this.onGround && this.state !== 'fall') {
      this.vx = this.intendedSpeed(config, context);
      this.stateTime += dt * 1000;
      if (this.stateTime >= this.stateDuration) this.enterState(pickNext(this.state));
    } else if (this.onGround) {
      // Landed, or the floor rose to meet us when a monitor changed. Bleed off
      // the throw, then rejoin the state machine rather than falling forever.
      this.vx = decay(this.vx, GROUND_DRAG, dt);
      if (Math.abs(this.vx) < REST_SPEED) {
        this.vx = 0;
        this.enterState('sit');
      }
    } else {
      this.vx = decay(this.vx, AIR_DRAG, dt);
      this.vy = Math.min(TERMINAL_VELOCITY, this.vy + GRAVITY * dt);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Turn around at the ends of the desktop instead of piling up against them.
    const clampedX = this.world.clampX(this.x, EDGE_MARGIN);
    if (clampedX !== this.x) {
      this.x = clampedX;
      this.facing = this.facing < 0 ? 1 : -1;
      this.vx = this.onGround ? 0 : -this.vx * 0.4;
    }

    const ground = this.world.groundAt(this.x, this.y);
    if (this.y >= ground) {
      if (!this.onGround) this.land(ground);
      this.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (this.y < ground - 1) {
      // Walked off a taller monitor onto a shorter one, or was dropped.
      if (this.onGround && this.state !== 'fall') this.enterState('fall');
      this.onGround = false;
    }
  }

  intendedSpeed(config, context) {
    if (config.speed === 0) return 0;

    if (this.state === 'chase' && context.cursor) {
      const dx = context.cursor.x - this.x;
      if (Math.abs(dx) < 40) return 0;
      this.facing = Math.sign(dx);
    }

    return this.facing * config.speed * this.speedScale;
  }

  land(ground) {
    this.landSquash = clamp(Math.abs(this.vy) / 2600, 0, 0.32);
    this.onGround = true;
    this.y = ground;

    if (this.thrown) {
      this.thrown = false;
      // A hard throw skids on landing; a gentle drop just settles.
      this.enterState(Math.abs(this.vx) > 260 ? 'run' : 'sit');
    } else if (this.state === 'fall') {
      this.enterState('sit');
    }
  }

  // -- presentation --------------------------------------------------------

  /** Stills only ever become motion here: bob, sway, breath, squash. */
  animation() {
    const t = this.clock;

    if (this.dragging || this.state === 'held') {
      return { bob: 0, angle: Math.sin(t * 7) * 4, stretch: 0.02 };
    }
    if (!this.onGround || this.state === 'fall') {
      return {
        bob: 0,
        angle: clamp(this.vx * 0.045, -28, 28),
        stretch: clamp(Math.abs(this.vy) / 9000, 0, 0.14),
      };
    }

    switch (this.state) {
      case 'walk':
      case 'run':
      case 'chase': {
        const rate = this.state === 'walk' ? 7.5 : 12.5;
        const phase = t * rate;
        return {
          bob: -Math.abs(Math.sin(phase)) * this.height * 0.035,
          angle: Math.sin(phase * 0.5) * 2.4,
          stretch: Math.sin(phase) * 0.03,
        };
      }
      case 'sleep':
        return { bob: 0, angle: 0, stretch: Math.sin(t * 1.1) * 0.022 };
      case 'groom':
        return { bob: 0, angle: Math.sin(t * 5.5) * 3.5, stretch: Math.sin(t * 5.5) * 0.014 };
      default:
        return { bob: 0, angle: 0, stretch: Math.sin(t * 1.9) * 0.013 };
    }
  }

  render() {
    if (!this.pose) return;

    const { content, aspect } = this.pose;
    const height = this.standingHeight() / content.height;
    const width = height * aspect;
    // Anchor the visible cat, not the image's transparent padding, to its feet.
    const left = this.x - content.centerX * width;
    const top = this.y - content.y1 * height;

    this.box = { left, top, width, height };

    const { bob, angle, stretch } = this.animation();
    const scaleY = 1 + stretch - this.landSquash;
    const scaleX = 1 / scaleY; // squash and stretch preserve volume

    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.element.style.transform = `translate3d(${left}px, ${top + bob}px, 0)`;
    this.art.style.transform = `rotate(${angle}deg) scale(${scaleX * this.mirror()}, ${scaleY})`;

    this.renderShadow();
  }

  renderShadow() {
    const ground = this.world.groundAt(this.x, this.y);
    const standing = this.standingHeight();
    // The shadow stays on the floor while the cat is in the air, shrinking and
    // fading with height. That separation is most of the sense of depth.
    const airborne = clamp((ground - this.y) / (standing * 1.6), 0, 1);
    const spread = (1 - airborne * 0.45) * standing * 0.8;
    const opacity = (1 - airborne * 0.75) * (this.state === 'sleep' ? 0.8 : 1);

    this.shadow.style.transform =
      `translate3d(${this.x - spread / 2}px, ${ground - 7}px, 0) scale(${spread / 100}, ${1 - airborne * 0.3})`;
    this.shadow.style.opacity = opacity.toFixed(3);
  }
}
