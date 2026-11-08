import type { FlightPhase, GeoPoint, TelemetryFrame } from "@/contracts/telemetry";

/**
 * Simulador determinista de una misión de levantamiento en patrón "lawnmower"
 * (equivalente a una ruta WPML de mapeo de área generada para Matrice 350 RTK).
 *
 * Es un adaptador de servicio: la UI consume `TelemetryFrame` sin saber si
 * proviene de este simulador, de un WebSocket MQTT de DJI Cloud API o de un
 * puente MSDK. Sustituirlo por una fuente real no requiere tocar componentes.
 */

const EARTH_RADIUS_M = 6_378_137;
const DEG = Math.PI / 180;

export interface SimulatorConfig {
  readonly aircraftSn: string;
  readonly origin: GeoPoint;
  readonly lanes: number;
  readonly laneLengthM: number;
  readonly laneSpacingM: number;
  readonly surveyAltitudeM: number;
  readonly cruiseSpeedMs: number;
  readonly seed: number;
}

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  aircraftSn: "1581F5BKD23A900X",
  origin: { lat: -22.30712, lon: -68.90184 },
  lanes: 6,
  laneLengthM: 420,
  laneSpacingM: 48,
  surveyAltitudeM: 120,
  cruiseSpeedMs: 12,
  seed: 7,
};

/** PRNG mulberry32: reproducible entre renders y entre SSR/CSR. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function offset(origin: GeoPoint, eastM: number, northM: number): GeoPoint {
  const dLat = northM / EARTH_RADIUS_M;
  const dLon = eastM / (EARTH_RADIUS_M * Math.cos(origin.lat * DEG));
  return { lat: origin.lat + dLat / DEG, lon: origin.lon + dLon / DEG };
}

interface Vec {
  e: number;
  n: number;
}

/** Waypoints locales (metros E/N desde el origen) del patrón de barrido. */
export function buildSurveyPath(cfg: SimulatorConfig): Vec[] {
  const pts: Vec[] = [{ e: 0, n: 0 }];
  // Líneas de vuelo en sentido E-O, desplazadas hacia el norte.
  for (let i = 0; i < cfg.lanes; i += 1) {
    const n = 50 + i * cfg.laneSpacingM;
    const [e0, e1] = i % 2 === 0 ? [40, 40 + cfg.laneLengthM] : [40 + cfg.laneLengthM, 40];
    pts.push({ e: e0, n }, { e: e1, n });
  }
  pts.push({ e: 0, n: 0 });
  return pts;
}

export class FlightSimulator {
  private readonly cfg: SimulatorConfig;
  private readonly path: Vec[];
  private readonly rand: () => number;
  private seq = 0;
  private pos: Vec = { e: 0, n: 0 };
  private alt = 0;
  private yaw = 0;
  private speed = 0;
  private vs = 0;
  private roll = 0;
  private pitch = 0;
  private segment = 0;
  private battery = 98;
  private images = 0;
  private distanceSinceShot = 0;
  private phase: FlightPhase = "preflight";
  private phaseClock = 0;

  constructor(cfg: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG) {
    this.cfg = cfg;
    this.path = buildSurveyPath(cfg);
    this.rand = mulberry32(cfg.seed);
  }

  get pathLocal(): readonly Vec[] {
    return this.path;
  }

  get originGeo(): GeoPoint {
    return this.cfg.origin;
  }

  /** Proyección equirectangular local (válida para áreas de pocos km). */
  toLocal(p: GeoPoint): Vec {
    const o = this.cfg.origin;
    return {
      e: (p.lon - o.lon) * DEG * EARTH_RADIUS_M * Math.cos(o.lat * DEG),
      n: (p.lat - o.lat) * DEG * EARTH_RADIUS_M,
    };
  }


  /** Avanza la simulación `dt` segundos y devuelve la trama resultante. */
  step(dt: number, now = Date.now()): TelemetryFrame {
    this.phaseClock += dt;
    const noise = () => (this.rand() - 0.5) * 2;

    switch (this.phase) {
      case "preflight":
        if (this.phaseClock > 1.5) this.setPhase("takeoff");
        break;
      case "takeoff": {
        this.vs = Math.min(6, this.vs + 3 * dt);
        this.alt += this.vs * dt;
        if (this.alt >= this.cfg.surveyAltitudeM) {
          this.alt = this.cfg.surveyAltitudeM;
          this.vs = 0;
          this.segment = 1;
          this.setPhase("transit");
        }
        break;
      }
      case "transit":
      case "survey":
      case "return": {
        this.advanceAlongPath(dt);
        break;
      }
      case "landing": {
        this.vs = Math.max(-3, this.vs - 2 * dt);
        this.alt = Math.max(0, this.alt + this.vs * dt);
        if (this.alt <= 0.05) this.reset();
        break;
      }
      case "orbit":
        this.setPhase("return");
        break;
    }

    this.battery = Math.max(18, this.battery - dt * (this.phase === "takeoff" ? 0.09 : 0.045));

    const geo = offset(this.cfg.origin, this.pos.e, this.pos.n);
    const linkQuality = Math.max(2, Math.min(5, Math.round(4.6 + noise() * 0.7 - this.distanceFromHome() / 900)));

    const frame: TelemetryFrame = {
      aircraftSn: this.cfg.aircraftSn,
      seq: this.seq++,
      timestamp: now,
      phase: this.phase,
      position: geo,
      altitudeAgl: this.alt,
      groundSpeed: this.speed,
      verticalSpeed: this.vs,
      attitude: {
        pitch: this.pitch + noise() * 0.25,
        roll: this.roll + noise() * 0.25,
        yaw: ((this.yaw % 360) + 360) % 360,
      },
      gimbal: { pitch: this.phase === "survey" ? -90 : -35, yaw: 0 },
      battery: {
        percent: this.battery,
        voltage: 44.4 + (this.battery / 100) * 8.2 + noise() * 0.05,
        temperatureC: 31 + noise() * 0.4,
      },
      link: { quality: linkQuality, videoLatencyMs: 148 + noise() * 22 },
      rtk: {
        fix: this.phase === "preflight" ? "float" : "fixed",
        satellites: 38 + Math.round(noise() * 2),
        hAccuracyCm: this.phase === "preflight" ? 14 : 1.2 + Math.abs(noise()) * 0.6,
      },
      mission: {
        waypointIndex: Math.min(this.segment, this.path.length - 1),
        waypointTotal: this.path.length - 1,
        capturedImages: this.images,
      },
    };
    return frame;
  }

  private distanceFromHome(): number {
    return Math.hypot(this.pos.e, this.pos.n);
  }

  private setPhase(next: FlightPhase): void {
    this.phase = next;
    this.phaseClock = 0;
  }

  private advanceAlongPath(dt: number): void {
    const target = this.path[this.segment];
    if (!target) {
      this.setPhase("landing");
      return;
    }
    const de = target.e - this.pos.e;
    const dn = target.n - this.pos.n;
    const dist = Math.hypot(de, dn);

    const desiredYaw = (Math.atan2(de, dn) / DEG + 360) % 360;
    let yawErr = desiredYaw - this.yaw;
    yawErr = ((yawErr + 540) % 360) - 180;
    const yawRate = Math.max(-45, Math.min(45, yawErr * 2.2));
    this.yaw += yawRate * dt;

    const brakingDistance = (this.speed * this.speed) / (2 * 2.5);
    const aligned = Math.abs(yawErr) < 12;
    const targetSpeed = !aligned ? 1.5 : dist < brakingDistance + 2 ? 2 : this.cfg.cruiseSpeedMs;
    const accel = Math.max(-2.5, Math.min(2.5, (targetSpeed - this.speed) * 1.8));
    this.speed = Math.max(0, this.speed + accel * dt);

    this.pitch = -accel * 2.4 - this.speed * 0.9;
    this.roll = yawRate * this.speed * 0.012;

    const travel = Math.min(dist, this.speed * dt);
    if (dist > 0.001) {
      this.pos.e += (de / dist) * travel;
      this.pos.n += (dn / dist) * travel;
    }

    if (this.phase === "survey") {
      this.distanceSinceShot += travel;
      const frontOverlapSpacing = 22;
      while (this.distanceSinceShot >= frontOverlapSpacing) {
        this.distanceSinceShot -= frontOverlapSpacing;
        this.images += 1;
      }
    }

    if (dist < 1.5) {
      this.segment += 1;
      const lastSurveyIdx = this.path.length - 2;
      if (this.segment === 2) this.setPhase("survey");
      else if (this.segment > lastSurveyIdx && this.phase === "survey") this.setPhase("return");
      if (this.segment >= this.path.length) this.setPhase("landing");
    }
  }

  private reset(): void {
    this.pos = { e: 0, n: 0 };
    this.alt = 0;
    this.vs = 0;
    this.speed = 0;
    this.segment = 0;
    this.images = 0;
    this.battery = 98;
    this.setPhase("preflight");
  }
}
