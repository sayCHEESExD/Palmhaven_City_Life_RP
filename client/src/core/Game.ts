import {
  CHAT_LINES,
  DAY_SECONDS,
  CURB,
  EMOTES,
  HOUSE_STYLES,
  INTERIOR_HEIGHT,
  JOBS,
  POSE,
  SHOPS,
  STATUS,
  city,
  cityPlan,
  formatMoney,
  furnitureProblem,
  houseToWorld,
  insideHouse,
  isAircraft,
  isLand,
  itemById,
  jobById,
  jobByIndex,
  propById,
  quarterYaw,
  timeOfDay,
  seatsOfPiece,
  visibleName,
  worldToHouse,
  WorldCollision,
  isBloxityEmoteId,
  type ChatMessage,
  type FxMessage,
  type Interactable,
  type JobId,
  type NoticeMessage,
  type SelfState,
  type ShopId,
} from '@palmhaven/shared';
import { Group, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { setEmoteClock } from '../animation/BloxityEmotes.js';
import { AudioManager } from '../audio/AudioManager.js';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { lookFromLegion } from '../bloxity/avatarLook.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { isMobileGpu } from '../config/device.js';
import { InputManager } from '../input/InputManager.js';
import { buildProp } from '../models/props.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { accessoryKey, accessoryModel, heldKey, heldModel } from '../player/gear.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { actionOf } from '../player/RemotePlayer.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { BuildPanel } from '../ui/BuildPanel.js';
import { ChoiceDialog, ConfirmDialog, PlayerMenu } from '../ui/Dialogs.js';
import { Hud } from '../ui/Hud.js';
import { IconFactory } from '../ui/IconFactory.js';
import { MainMenu } from '../ui/MainMenu.js';
import { MapPainter, MapWindow, type MapMarker } from '../ui/MapView.js';
import { anyModalOpen, closeTopModal } from '../ui/Modal.js';
import { Phone, type PhoneHouse, type PhonePerson } from '../ui/Phone.js';
import { ShopWindow } from '../ui/ShopWindow.js';
import { TouchExtras } from '../ui/TouchExtras.js';
import { RADIO_STATIONS, VehicleHud } from '../ui/VehicleHud.js';
import { WorldOverlay, type PromptSpec } from '../ui/WorldOverlay.js';
import { logger } from '../util/logger.js';
import { SEAT_POSE } from '../vehicles/VehicleView.js';
import { VehicleManager } from '../vehicles/VehicleManager.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { CityView } from '../world/CityView.js';
import { Effects } from '../world/Effects.js';
import { Homes } from '../world/Homes.js';
import { Life } from '../world/Life.js';
import { Sea } from '../world/Sea.js';
import { Sky } from '../world/Sky.js';
import { Traffic } from '../world/Traffic.js';

const SCOPE = 'Game';

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT');
};

/** Where a ray first enters a box, or null. */
const rayBox = (o: Vector3, d: Vector3, b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }): number | null => {
  let near = -Infinity;
  let far = Infinity;
  for (const [origin, dir, min, max] of [
    [o.x, d.x, b.minX, b.maxX],
    [o.y, d.y, b.minY, b.maxY],
    [o.z, d.z, b.minZ, b.maxZ],
  ] as const) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let t1 = (min - origin) / dir;
    let t2 = (max - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) return null;
  }
  return far < 0 ? null : Math.max(0, near);
};

interface Candidate {
  readonly distance: number;
  readonly spec: PromptSpec;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const SETTINGS_KEY = 'palmhaven.settings';

/**
 * THE COMPOSITION ROOT. Owns every subsystem and the per-frame order - input,
 * prediction, the replicated world, prompts, the HUD, the render - and no
 * gameplay rules: every dollar, job step, seat and home is the server's. The
 * client asks, predicts its own movement, and draws what the server says.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly network: NetworkClient;
  private readonly sky = new Sky();
  private readonly sea = new Sea();
  private readonly atmosphere: Atmosphere;
  private readonly effects = new Effects();
  private readonly audio = new AudioManager();
  private readonly bloxity: Bloxity;
  private readonly bloxityPanel: BloxityPanel;
  private readonly icons: IconFactory;
  private readonly overlay: WorldOverlay;
  private readonly painter: MapPainter;
  private readonly hud: Hud;
  private readonly vehicleHud: VehicleHud;
  private readonly phone: Phone;
  private readonly shopWindow: ShopWindow;
  private readonly mapWindow: MapWindow;
  private readonly choices: ChoiceDialog;
  private readonly confirm: ConfirmDialog;
  private readonly playerMenu: PlayerMenu;
  private readonly build: BuildPanel;
  private readonly menu: MainMenu;
  private readonly touch: TouchExtras;
  private readonly remotePlayers: RemotePlayerManager;
  private readonly vehicles: VehicleManager;
  private readonly fpsReadout: HTMLDivElement;
  private cityView!: CityView;
  private homes!: Homes;
  private life!: Life;
  private traffic!: Traffic;
  private localPlayer: LocalPlayer | null = null;
  private dresser: AvatarDresser | null = null;
  private pendingAvatar: (() => void) | null = null;
  private localSessionId: string | null = null;
  private self: SelfState | null = null;
  private patched = false;
  private time = 0;
  private radio = 1;
  private cameraMode = 0;
  private waypoint: { x: number; z: number; name: string } | null = null;
  private gpsTarget: string | null = null;
  private lastStepAt = 0;
  private stride = 0;
  private oceanLevel = 0;
  private indoors = false;
  private envCheckAt = 0;
  private sirenLevel = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private showNames = true;
  private menuIntro = 0;
  private playing = false;
  private cuffedPress = false;
  private readonly enterables: { b: { x: number; z: number; w: number; d: number; rot: number; base: number } }[];
  private ghost: Group | null = null;
  private ghostKey = '';
  private readonly ghostMaterial = new MeshBasicMaterial({ color: 0x5aff7a, transparent: true, opacity: 0.5, depthWrite: false });
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly plane = new Plane(new Vector3(0, 1, 0), -CURB);
  private readonly hit = new Vector3();
  private readonly occludeFrom = new Vector3();
  private readonly occludeDir = new Vector3();
  private readonly seat = new Vector3();
  private readonly settings = { music: 0.7, sfx: 1, quality: 'High', names: true, sensitivity: 1 };

  constructor(private readonly container: HTMLElement) {
    this.renderer = new RendererManager(container);
    this.icons = new IconFactory(this.renderer.renderer);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.vehicles = new VehicleManager(this.sceneManager.scene);
    this.vehicles.onHorn = (view) => {
      const p = this.localPlayer?.position;
      const d = p ? Math.hypot(view.pose.x - p.x, view.pose.z - p.z) : 0;
      if (d < 140) this.audio.play('horn', 1 - d / 160, view.def.class === 'boat' ? 0.7 : 1);
    };
    this.atmosphere = new Atmosphere(this.sceneManager, this.sky);
    this.overlay = new WorldOverlay(container);
    this.painter = new MapPainter();
    this.loadSettings();

    this.hud = new Hud(container, this.painter, this.icons, {
      shop: () => this.openShopsList(),
      emotes: () => this.phone.open('emotes'),
      jobs: () => this.phone.open('jobs'),
      map: () => this.mapWindow.open(),
      people: () => this.phone.open('people'),
      phone: () => {
        this.audio.play('open');
        this.phone.toggle();
      },
      hotbar: (item) => this.equip(item),
      useHeld: () => this.useHeld(),
      cancelTask: () => this.network.jobAction('cancel'),
    });
    this.vehicleHud = new VehicleHud(container, {
      horn: () => this.network.vehicleAction('horn'),
      lights: () => this.network.vehicleAction('lights'),
      lock: () => this.network.vehicleAction('lock'),
      siren: () => this.network.vehicleAction('siren'),
      exit: () => this.network.exitVehicle(),
      camera: () => this.cycleCamera(),
      radio: (step) => {
        this.radio = (this.radio + step + RADIO_STATIONS.length) % RADIO_STATIONS.length;
        this.audio.play('click');
      },
    });
    this.shopWindow = new ShopWindow(container, this.icons, (shop, id, paint) => {
      this.audio.play('click');
      this.network.buy(shop, id, paint);
    });
    this.mapWindow = new MapWindow(container, this.painter, {
      waypoint: (x, z, name) => {
        this.waypoint = { x, z, name };
        this.gpsTarget = null;
        this.hud.toast(`GPS set: ${name}`, 'info');
      },
      travel: (place) => this.network.teleport(place),
      travelHome: () => this.network.teleport('home'),
    });
    this.choices = new ChoiceDialog(container);
    this.confirm = new ConfirmDialog(container);
    this.playerMenu = new PlayerMenu(container);
    this.build = new BuildPanel(container, this.icons, {
      done: () => this.setBuilding(false),
      rotate: () => this.build.rotate(),
      shop: () => {
        this.setBuilding(false);
        this.waypointToPlace('furniture');
      },
      changed: () => {
        this.ghostKey = '';
      },
    });
    this.phone = new Phone(container, this.icons, {
      spawnVehicle: (kind, paint) => this.network.spawnVehicle(kind, paint),
      clearVehicle: () => this.network.despawnVehicle(),
      lockVehicle: () => this.network.vehicleAction('lock'),
      setJob: (job) => this.network.setJob(job),
      claimHouse: (id) => this.network.claimHouse(id, true),
      buyHouse: (id) => {
        const plot = cityPlan().houses[id];
        if (!plot) return;
        const style = HOUSE_STYLES[plot.style];
        this.confirm.confirm(`Buy a ${style.name}?`, `${plot.address} for ${formatMoney(style.price)}. You keep the style for good and can move into any free one.`, 'Buy it!', () => this.network.buyHouse(id, true), '#27ae60');
      },
      leaveHouse: () => this.confirm.confirm('Move out?', 'Your furniture is saved and comes with you to your next home of this style.', 'Move out', () => this.network.leaveHouse(), '#868e96'),
      lockHouse: (locked) => this.network.lockHouse(locked),
      goHome: () => this.network.teleport('home'),
      decorate: () => this.startDecorating(),
      equip: (item) => this.equip(item),
      useItem: () => this.useHeld(),
      wear: (slot, id) => this.network.wear(slot, id),
      customize: () => this.bloxity.showCustomizer(),
      emote: (id) => this.network.emote(id),
      say: (line) => this.network.say(line),
      openMap: () => this.mapWindow.open(),
      gpsTo: (id) => {
        this.gpsTarget = id;
        this.waypoint = null;
      },
      invite: () => this.invite(),
      settings: {
        get: () => ({ ...this.settings }),
        set: (key, value) => this.applySetting(key, value),
      },
      cancelTask: () => this.network.jobAction('cancel'),
      signIn: () => void this.bloxity.showAuthPopup(),
    });
    this.phone.onOpenChange = (open) => this.audio.play(open ? 'open' : 'close');
    this.touch = new TouchExtras(container, {
      use: () => this.overlay.activateFirst(),
      vehicle: () => this.vehicleKey(),
      hold: (name, down) => {
        if (name === 'run' || name === 'boost') this.input.virtual.sprint = down;
        else if (name === 'brake' || name === 'up') this.input.virtual.jump = down;
        else if (name === 'down') this.input.virtual.down = down;
      },
      horn: () => this.network.vehicleAction('horn'),
    });
    this.menu = new MainMenu(container, {
      play: (job) => this.play(job),
      settings: () => this.phone.open('settings'),
      account: () => (this.bloxity.isLoggedIn() ? void this.bloxityPanel.openBux() : void this.bloxity.showAuthPopup()),
    });

    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.applySetting('music', level),
      setGraphicsQuality: (level) => this.applySetting('quality', level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.applySetting('sensitivity', scale),
      respawn: () => this.network.requestRespawn(),
      playEmote: (id) => this.playBloxityEmote(id),
      pointerLockChanged: () => undefined,
      avatarChanged: (equipped, proportions) => {
        const look = lookFromLegion(equipped, proportions);
        this.network.sendAvatar(look);
        const apply = (): void => this.dresser?.setLook(look.appearance, look.proportions);
        if (this.dresser) apply();
        else this.pendingAvatar = apply;
      },
    });
    this.bloxityPanel = new BloxityPanel(container, this.bloxity);
    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'aoe-fps aoe-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    this.enterables = cityPlan()
      .buildings.filter((b) => b.interior !== null)
      .map((b) => ({ b }));

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('pointerdown', this.onGesture);
    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
        this.bloxity.updateRoom(this.network.roomId);
        void this.sendFriends();
      },
      onPatch: () => {
        this.patched = true;
      },
      onRespawn: (message) => {
        const player = this.localPlayer;
        if (!player) return;
        player.teleport(message.x, message.y, message.z, message.rotationY);
        if (message.reason !== 'exit') this.input.look.setYaw(message.rotationY);
        if (message.reason === 'jail') this.audio.play('jail');
        if (message.reason === 'teleport' || message.reason === 'join') this.camera.snapTo(player.position, message.reason === 'teleport');
      },
      onSelf: (state) => this.onSelf(state),
      onNotice: (message) => this.onNotice(message),
      onFx: (message) => this.onFx(message),
      onChat: (message) => this.onChat(message),
    });
    this.network.setTokenProvider(() => this.bloxity.getToken());
    // Every screen samples a replicated emote against the same room clock.
    setEmoteClock(() => this.network.now());
    this.network.setLookProvider(() => lookFromLegion(this.bloxity.getEquipped(), this.bloxity.getProportions()));
    this.network.setDisplayProvider(() => identityFromLegion(this.bloxity.getUser(), this.bloxity.getGuest()));
    this.bloxity.onUserChanged((user) => {
      this.network.sendAuth(this.bloxity.getToken());
      const identity = identityFromLegion(user, this.bloxity.getGuest());
      this.network.sendIdentity(identity);
      this.menu.setPlayer(identity.displayName, identity.avatarUrl);
      void this.sendFriends();
    });
  }

  // ------------------------------------------------------------- lifecycle

  startBloxity(): void {
    this.bloxity.start();
    document.body.classList.toggle('aoe-portal-embedded', this.bloxity.embedded);
  }

  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  async initialise(): Promise<void> {
    const scene = this.sceneManager.scene;
    await playerModelLoader.load();
    try {
      await Promise.race([document.fonts.load('400 40px "Pacifico"'), new Promise((r) => setTimeout(r, 1500))]);
      await Promise.race([document.fonts.load('400 40px "Righteous"'), new Promise((r) => setTimeout(r, 800))]);
    } catch {
      /* signs fall back to the next font */
    }
    const mobile = isMobileGpu();
    this.cityView = new CityView();
    this.homes = new Homes();
    this.life = new Life(scene, mobile ? 6 : 14);
    this.traffic = new Traffic(mobile ? 8 : 18);
    scene.add(this.sky.root, this.sea.root, this.cityView.root, this.homes.root, this.life.root, this.traffic.root, this.effects.root);
    this.localPlayer = new LocalPlayer(this.collisionForPrediction());
    this.dresser = new AvatarDresser(this.localPlayer.character);
    this.pendingAvatar?.();
    this.pendingAvatar = null;
    scene.add(this.localPlayer.character.root);
    const spawn = city().placeById.get('spawn')!;
    this.localPlayer.teleport(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.input.look.setYaw(spawn.yaw);
    this.camera.snapTo(this.localPlayer.position);
    this.applySetting('quality', this.settings.quality);
    logger.info(SCOPE, 'world ready');
  }

  private collisionCache: WorldCollision | null = null;

  /** The same collision world the server steps everyone through. */
  private collisionForPrediction(): WorldCollision {
    if (!this.collisionCache) this.collisionCache = new WorldCollision();
    return this.collisionCache;
  }

  private invite(): void {
    const link = this.bloxity.getInviteLink(this.network.roomId);
    if (!link) {
      this.hud.toast('Invites work when playing on Bloxity.', 'info');
      return;
    }
    void navigator.clipboard?.writeText(link).then(
      () => this.hud.toast('Invite link copied!', 'good'),
      () => this.hud.toast(link, 'info'),
    );
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  private play(job: JobId): void {
    this.menu.close();
    this.playing = true;
    this.audio.resume();
    this.audio.play('success');
    if (job !== 'civilian' && job !== this.self?.job) this.network.setJob(job);
    const p = this.localPlayer;
    if (p) {
      this.input.look.setYaw(p.yaw);
      this.input.look.setPitch(0.32);
      this.camera.snapTo(p.position, true);
    }
    this.hud.banner('Welcome to Palmhaven!');
  }

  private async sendFriends(): Promise<void> {
    if (!this.bloxity.isLoggedIn()) return;
    const friends = await this.bloxity.getFriends();
    this.network.friends(friends.map((f) => f._id).filter(Boolean));
  }

  // ----------------------------------------------------------------- frame

  update(delta: number): void {
    const now = this.network.now();
    this.time += delta;
    const modal = anyModalOpen() || this.menu.isOpen;
    this.input.setSuppressed(modal);
    const player = this.localPlayer;
    const me = this.localSessionId ? this.network.player(this.localSessionId) : null;
    const driving = player?.mode === 'drive';
    this.input.vehicleMode = driving;
    const input = this.input.sample();

    if (this.patched) {
      this.patched = false;
      this.syncWorld();
    }

    // Vehicles: what the local prediction collides with.
    if (player) player.obstacles = this.vehicles.obstacles(this.network.vehicles?.entries() ?? null);

    // In a vehicle the camera swings in behind unless the player is looking around.
    if (player && (driving || player.mode === 'carried') && me?.vehicle) {
      const view = this.vehicles.get(me.vehicle);
      if (view && performance.now() - this.input.look.lastTurnAt > 1600) {
        const want = view.pose.yaw;
        let diff = want - this.input.look.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const speed = driving ? player.horizontalSpeed : 10;
        if (speed > 3) this.input.look.setYaw(this.input.look.yaw + diff * Math.min(1, delta * 2.2));
      }
    }
    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);
    this.camera.setZoom(this.input.look.zoom);

    if (player) {
      player.update(delta, input, this.input.look.yaw);
      const placement = player.consumePlacement();
      if (placement !== 'none') this.camera.snapTo(player.position, false);
      for (const message of player.drainOutgoing()) this.network.sendInput(message);
      if (player.crash > 18) {
        this.audio.play('crash', Math.min(1, player.crash / 60));
        this.effects.sparks(player.position.x, player.position.y + 1, player.position.z);
      }
    }

    // Vehicles and everyone riding them.
    const steer = input.moveX;
    this.vehicles.update(delta, driving && player ? player.vehicleId : 0, driving && player ? player.vehicleView : null, steer, this.atmosphere.night);
    this.placeRiders(me);

    const target = player ? this.cameraTarget(player, me) : null;
    if (target) this.camera.setTarget(target);
    this.remotePlayers.advance(delta, player?.position ?? null);
    if (player && me) this.updateLocalLook(me, delta);

    const cam = this.camera.camera.position;
    const mobile = isMobileGpu();
    const fogFar = mobile ? 620 : 920;
    this.atmosphere.update(now + this.timeWarp, fogFar * 0.32, fogFar);
    this.cityView.setRanges(fogFar + 60, mobile ? 230 : 330);
    this.cityView.update(delta, this.camera.camera, now, this.atmosphere.night);
    this.sea.setNight(this.atmosphere.night);
    this.sky.follow(cam.x, cam.z);
    this.sky.update(delta);
    this.sea.update(delta);
    this.homes.update(delta);
    this.life.update(delta, cam.x, cam.z);
    this.traffic.update(delta, now, cam.x, cam.z, this.trafficBlockers(), this.atmosphere.night);
    this.effects.update(delta);
    if (player) this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);

    if (this.menu.isOpen) this.menuCamera(delta);
    else this.camera.update(delta, player?.horizontalSpeed ?? 0);
    if (!this.menu.isOpen) this.occludeCamera();

    this.overlay.begin(this.camera.camera, this.renderer.width, this.renderer.height);
    if (player && !modal && this.playing) {
      this.handlePicks();
      this.prompts(me);
      this.worldLabels(me);
    }
    this.overlay.end();
    this.updateHud(now, me);
    this.updateAudio(delta, me);
    this.updateGhost();
    this.tickFps(delta);
    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  /** A slow drift along Ocean Drive behind the title screen. */
  private menuCamera(delta: number): void {
    this.menuIntro += delta;
    const t = this.menuIntro * 0.05;
    const cam = this.camera.camera;
    const z = -40 + Math.sin(t) * 260;
    cam.position.set(262 + Math.sin(t * 0.7) * 8, 26 + Math.sin(t * 0.5) * 6, z);
    cam.lookAt(200, 18, z + 90);
  }

  // ------------------------------------------------------------ replication

  private syncWorld(): void {
    const players = this.network.players;
    if (!players) return;
    const seen = new Set<string>();
    players.forEach((state, sessionId) => {
      seen.add(sessionId);
      if (sessionId === this.localSessionId) {
        const player = this.localPlayer;
        if (!player) return;
        if (state.ready) player.reconcile(state, state.vehicle ? this.network.vehicle(state.vehicle) : null);
        return;
      }
      if (this.remotePlayers.has(sessionId)) this.remotePlayers.update(sessionId, state);
      else {
        this.remotePlayers.add(sessionId, state);
        // The portal's friend toasts match on the player's name: those already here
        // when we arrived are 'in the room', anyone after that 'joined'.
        const name = state.displayName || sessionId;
        if (this.rosterSynced) this.bloxity.playerJoined(name);
        else this.bloxity.playerInRoom(name);
      }
    });
    this.remotePlayers.retain(seen);
    if (this.localSessionId && seen.has(this.localSessionId)) this.rosterSynced = true;
    this.vehicles.sync(this.network.vehicles?.entries() ?? null);
    this.homes.sync(this.network.state?.houses ?? null, this.collisionForPrediction(), this.localSessionId ?? '');
    this.life.syncShops(this.network.state?.shops?.entries() ?? null);
  }

  /** The local body: dressed from replicated state, posed by mode. */
  private updateLocalLook(me: NetPlayerState, delta: number): void {
    const player = this.localPlayer!;
    const c = player.character;
    c.setHeld(heldKey(me.item), () => heldModel(me.item));
    c.setWorn('hat', accessoryKey(me.hat), () => accessoryModel(me.hat));
    c.setWorn('face', accessoryKey(me.face), () => accessoryModel(me.face));
    c.setWorn('back', accessoryKey(me.back), () => accessoryModel(me.back));
    c.motion.cuffed = (me.status & STATUS.cuffed) !== 0;
    // The server's emote wins once it has echoed; until then, our own optimistic start.
    const pending = this.bxPending;
    if (pending && (me.bxEmote === pending.id || this.network.now() - pending.at > 1500)) this.bxPending = null;
    c.motion.bxId = this.bxPending?.id ?? me.bxEmote ?? '';
    c.motion.bxStart = this.bxPending?.at ?? me.bxEmoteAt ?? 0;
    if (me.emoteSeq !== this.lastEmoteSeq) {
      this.lastEmoteSeq = me.emoteSeq;
      c.motion.emote = 0;
      c.setEmote(me.emote);
    } else if (me.emote === 0 || player.horizontalSpeed > 2) {
      c.setEmote(0);
    }
    if (this.lastItemUse >= 0 && me.itemUse !== this.lastItemUse) c.act(actionOf(me.item));
    this.lastItemUse = me.itemUse;
    if (player.mode === 'carried' && me.vehicle === 0) {
      c.motion.pose = me.pose;
      const p = player.position;
      c.root.position.lerp(new Vector3(me.x, me.y, me.z), me.pose === POSE.stand ? Math.min(1, delta * 12) : 1);
      c.root.rotation.y = me.rotationY;
      p.copy(c.root.position);
    } else if (player.mode === 'walk') {
      c.motion.pose = POSE.stand;
    }
  }

  private lastEmoteSeq = -1;
  /** True once the roster that was here when we joined has been announced. */
  private rosterSynced = false;
  /** A Bloxity emote this player just chose, shown until the server's echo takes over. */
  private bxPending: { id: string; at: number } | null = null;

  /**
   * The portal's emote picker chose an emote. Never checked for ownership (the
   * portal only offers what the player owns) and never for being known: an id
   * no client has a clip for is simply not drawn. Played on this screen at once,
   * and sent to the room, which replicates it to everyone else.
   */
  private playBloxityEmote(id: string): void {
    if (!isBloxityEmoteId(id)) return;
    const me = this.localSessionId ? this.network.player(this.localSessionId) : null;
    if (!me || me.vehicle || me.pose !== POSE.stand || me.status) return;
    this.bxPending = { id: id.toLowerCase(), at: this.network.now() };
    this.network.bloxityEmote(id);
  }
  private lastItemUse = -1;

  /** Everyone in a vehicle sits in its seat, posed for it. */
  private placeRiders(me: NetPlayerState | null): void {
    const place = (character: import('../player/PlayerCharacter.js').PlayerCharacter, vehicle: number, seat: number): boolean => {
      const view = this.vehicles.get(vehicle);
      if (!view) return false;
      const { yaw } = view.seatWorld(seat, this.seat);
      character.root.position.copy(this.seat);
      character.root.rotation.y = yaw;
      character.motion.pose = SEAT_POSE(view.def, seat);
      character.motion.steer = seat === 0 && character === this.localPlayer?.character ? this.input.sample().moveX : 0;
      return true;
    };
    for (const [, remote] of this.remotePlayers.all()) {
      if (remote.seated && !place(remote.character, remote.vehicle, remote.seat)) remote.seated = false;
    }
    if (me && me.vehicle && this.localPlayer) {
      place(this.localPlayer.character, me.vehicle, me.seat);
      this.localPlayer.position.copy(this.localPlayer.character.root.position);
    }
  }

  private cameraTarget(player: LocalPlayer, me: NetPlayerState | null): Vector3 {
    if (me?.vehicle) {
      const view = this.vehicles.get(me.vehicle);
      const def = view?.def;
      if (view && def) {
        const k = [1, 1.5, 0.7][this.cameraMode] ?? 1;
        this.camera.setFrame({ distance: def.camera.distance * k, height: def.camera.height * (0.9 + 0.1 * k) });
        return new Vector3(view.pose.x, view.pose.y, view.pose.z);
      }
    }
    this.camera.setFrame(null);
    return player.position;
  }

  private cycleCamera(): void {
    this.cameraMode = (this.cameraMode + 1) % 3;
    this.audio.play('click');
  }

  /** THE CAMERA NEVER HIDES BEHIND A WALL: it slides in along its line of sight. */
  private occludeCamera(): void {
    const player = this.localPlayer;
    if (!player) return;
    const cam = this.camera.camera.position;
    const from = this.occludeFrom.set(player.position.x, player.position.y + 2.6, player.position.z);
    const me = this.localSessionId ? this.network.player(this.localSessionId) : null;
    if (me?.vehicle) {
      const view = this.vehicles.get(me.vehicle);
      if (view) from.set(view.pose.x, view.pose.y + view.def.height * 0.8, view.pose.z);
    }
    const dir = this.occludeDir.subVectors(cam, from);
    const length = dir.length();
    if (length < 1) return;
    dir.divideScalar(length);
    let nearest = length;
    const collision = this.collisionForPrediction();
    collision.forEachNear(Math.min(from.x, cam.x), Math.max(from.x, cam.x), Math.min(from.z, cam.z), Math.max(from.z, cam.z), (b) => {
      if (b.maxY - b.minY < 2.4 || b.maxY < from.y - 3) return;
      if (b.maxX - b.minX < 1.6 && b.maxZ - b.minZ < 1.6) return;
      const t = rayBox(from, dir, b);
      if (t !== null && t > 0.3 && t < nearest) nearest = t;
    });
    if (nearest < length) cam.copy(from).addScaledVector(dir, Math.max(1.2, nearest - 0.4));
  }

  // ---------------------------------------------------------------- prompts

  private prompts(me: NetPlayerState | null): void {
    const player = this.localPlayer;
    if (!player || !me) return;
    const touch = document.body.classList.contains('aoe-touch-mode');
    const px = player.position.x;
    const py = player.position.y;
    const pz = player.position.z;
    const self = this.self;
    const list: Candidate[] = [];
    const offer = (distance: number, x: number, y: number, z: number, key: string, object: string, action: string, activate: () => void): void => {
      list.push({ distance, x, y, z, spec: { key, object, action, activate } });
    };
    let vehiclePrompt = false;

    if (this.build.isOpen) return;
    // Cuffed: struggle.
    if (me.status & STATUS.cuffed) {
      offer(0, px, py + 4.2, pz, 'SPACE', 'Handcuffs', 'Struggle!', () => this.network.struggle());
    } else if (me.vehicle) {
      const view = this.vehicles.get(me.vehicle);
      const action = view && isAircraft(view.def) && me.seat === 0 && view.pose.y > 2 ? 'Land first' : 'Get out';
      offer(0, px, py + 3.6, pz, 'F', view?.def.name ?? 'Vehicle', action, () => this.network.exitVehicle());
      vehiclePrompt = true;
    } else if (me.pose !== POSE.stand) {
      offer(0, px, py + 2.6, pz, 'E', 'Seat', 'Stand up', () => this.network.stand());
    } else {
      // Vehicles nearby.
      let bestVehicle: { d: number; id: number; drive: boolean; name: string; x: number; y: number; z: number } | null = null;
      for (const view of this.vehicles.all()) {
        const d = Math.hypot(view.pose.x - px, view.pose.z - pz) - view.def.length / 2;
        if (d > 4.5 || Math.abs(view.pose.y - py) > 6) continue;
        const state = this.network.vehicle(view.id);
        if (!state) continue;
        const mine = state.owner === this.localSessionId;
        const locked = (state.flags & 4) !== 0 && !mine;
        const drive = mine && !state.driver;
        if (!bestVehicle || d < bestVehicle.d) bestVehicle = { d, id: view.id, drive, name: locked ? `${view.def.name} (locked)` : mine ? view.def.name : `${visibleName(state.ownerName)}'s ${view.def.name}`, x: view.pose.x, y: view.pose.y + view.def.height + 0.8, z: view.pose.z };
      }
      if (bestVehicle) {
        const v = bestVehicle;
        offer(v.d, v.x, v.y, v.z, 'F', v.name, v.drive ? 'Drive' : 'Ride', () => this.network.enterVehicle(v.id, v.drive));
        vehiclePrompt = true;
      }
      // Job targets.
      const task = self?.task;
      if (task) {
        const d = Math.hypot(task.x - px, task.z - pz);
        if (d < 7) {
          if (task.kind === 'delivery' && task.stage === 'dropoff') offer(d - 2, task.x, task.y + 3.2, task.z, 'E', 'Parcel', 'Deliver', () => this.network.jobAction('deliver'));
          if (task.kind === 'police') offer(d - 2, task.x, task.y + 4.2, task.z, 'E', 'Suspect', 'Arrest', () => this.network.jobAction('arrest'));
          if (task.kind === 'medic') offer(d - 2, task.x, task.y + 2.2, task.z, 'E', 'Patient', 'Treat', () => this.network.jobAction('treat'));
        }
      }
      // City seats.
      for (const seat of city().seats) {
        const d = Math.hypot(seat.x - px, seat.z - pz);
        if (d > 3.2 || Math.abs(seat.y - py) > 3) continue;
        offer(d + 0.4, seat.x, seat.y + 2.4, seat.z, 'E', seat.pose === 'lie' ? 'Lie down' : 'Seat', seat.pose === 'lie' ? 'Lie down' : seat.pose === 'swing' ? 'Swing' : 'Sit', () => this.network.sit({ seat: seat.id }));
      }
      // Furniture seats in the home we are standing in.
      for (const plot of cityPlan().houses) {
        if (!insideHouse(plot, px, pz, -1)) continue;
        const house = this.network.house(plot.id);
        house?.furniture?.forEach((piece) => {
          for (const seat of seatsOfPiece(plot, { id: piece.id, kind: piece.kind, x: piece.x, z: piece.z, rot: piece.rot })) {
            const d = Math.hypot(seat.x - px, seat.z - pz);
            if (d > 3.2) continue;
            const name = propById(piece.kind)?.name ?? 'Seat';
            offer(d + 0.4, seat.x, seat.y + 2.4, seat.z, 'E', name, seat.pose === 'lie' ? 'Lie down' : 'Sit', () => this.network.sit({ house: plot.id, fid: seat.fid, index: seat.index }));
          }
        });
      }
      // Counters, machines, lockers, desks.
      for (const it of city().interactables) {
        const front = Math.hypot(it.x - px, it.z - pz);
        const back = Math.hypot(it.bx - px, it.bz - pz);
        const d = Math.min(front, back);
        if (d > 4.6 || Math.abs(it.y - py) > 4) continue;
        const spec = this.interactSpec(it, back < front);
        if (spec) offer(d, (it.x + it.bx) / 2, it.y + 4.4, (it.z + it.bz) / 2, 'E', spec.object, spec.action, spec.activate);
      }
      // Front doors of homes.
      for (const door of city().doors) {
        if (door.house === undefined) continue;
        const d = Math.hypot(door.x - px, door.z - pz);
        if (d > 5) continue;
        const spec = this.doorSpec(door.house);
        if (spec) offer(d + 0.6, door.x, door.y + 7.6, door.z, 'E', spec.object, spec.action, spec.activate);
      }
      // Other players.
      for (const [id, remote] of this.remotePlayers.all()) {
        if (remote.seated) continue;
        const r = remote.position;
        const d = Math.hypot(r.x - px, r.z - pz);
        if (d > 4.5 || Math.abs(r.y - py) > 3) continue;
        offer(d + 1.2, r.x, r.y + 5.8, r.z, 'E', visibleName(remote.displayName), 'Interact', () => this.openPlayerMenu(id));
      }
    }
    list.sort((a, b) => a.distance - b.distance);
    const first = list[0];
    if (first) {
      this.overlay.prompt(first.spec, first.x, first.y, first.z, touch);
      // A vehicle prompt rides along as a second chip when something else is nearer.
      const second = list.find((c, i) => i > 0 && c.spec.key !== first.spec.key);
      if (second) this.overlay.prompt(second.spec, first.x, first.y, first.z, touch);
    }
    const view = me.vehicle ? this.vehicles.get(me.vehicle) : undefined;
    this.touch.setMode({
      prompt: list.some((c) => c.spec.key === 'E'),
      vehiclePrompt,
      driving: player.mode === 'drive',
      riding: me.vehicle !== 0 && me.seat !== 0,
      aircraft: !!view && isAircraft(view.def),
      boost: !!view && view.def.handling.boost > 0,
    });
  }

  private interactSpec(it: Interactable, behind: boolean): { object: string; action: string; activate: () => void } | null {
    const self = this.self;
    const job = self?.job ?? 'civilian';
    switch (it.kind) {
      case 'register': {
        const shop = it.shop;
        if (!shop) return null;
        const def = SHOPS[shop];
        const working = behind && def.worker === job;
        if (working) {
          const task = self?.task;
          const ready = task && (task.kind === 'order' || task.kind === 'sale') && task.stage === 'serve';
          const cooking = task && task.kind === 'order' && task.stage === 'make';
          return { object: def.name, action: ready ? (task.kind === 'order' ? 'Serve order' : 'Ring up') : cooking ? 'Cook the order first' : 'Waiting for a customer', activate: () => this.network.interact(it.id) };
        }
        return { object: it.label, action: 'Shop', activate: () => this.openShop(shop) };
      }
      case 'station': {
        if (job !== 'chef') return null;
        return { object: propById(propIdByKey(it.prop))?.name ?? it.label, action: 'Cook', activate: () => this.network.interact(it.id) };
      }
      case 'atm':
        return { object: 'ATM', action: self?.dailyReady ? 'Daily Bonus!' : 'Bank', activate: () => this.atm(it.id) };
      case 'pump':
        return { object: 'Gas Pump', action: 'Refuel', activate: () => this.network.interact(it.id) };
      case 'jobdesk':
        return { object: 'Job Center', action: 'Find a job', activate: () => this.phone.open('jobs') };
      case 'mirror':
        return { object: it.label, action: 'Change outfit', activate: () => (it.shop === 'clothing' ? this.openShop('clothing') : this.phone.open('wardrobe')) };
      case 'vending':
        return { object: 'Vending Machine', action: 'Buy a drink', activate: () => this.openShop('vending') };
      case 'arcade':
        return { object: 'Arcade', action: 'Play', activate: () => this.arcade() };
      case 'piano':
        return null;
      case 'locker': {
        const lockerJob = it.job;
        if (!lockerJob) return null;
        const def = jobById(lockerJob)!;
        const on = job === lockerJob;
        return { object: it.label, action: on ? 'End shift' : `Work as ${def.title}`, activate: () => this.network.interact(it.id) };
      }
      case 'depot':
        return { object: 'PalmPost', action: job === 'delivery' ? 'Load parcels' : 'Become a courier', activate: () => this.network.interact(it.id) };
      case 'jail': {
        if (job !== 'police') return null;
        const suspect = this.escorted();
        if (!suspect) return { object: 'Booking Desk', action: 'Bring a suspect here', activate: () => this.hud.toast('Cuff a player and walk them here to book them.', 'info') };
        return { object: 'Booking Desk', action: 'Book suspect', activate: () => this.network.playerAction(suspect, 'book') };
      }
      case 'hangar':
        return { object: it.label, action: 'Aircraft', activate: () => this.phone.open('vehicles', 'airplanes') };
      case 'boats':
        return { object: it.label, action: 'Boats', activate: () => this.phone.open('vehicles', 'boats') };
      case 'dealer':
        return { object: 'Palm Motors', action: 'Browse cars', activate: () => this.openShop('dealer') };
      case 'bed':
        return null;
    }
    return null;
  }

  private doorSpec(houseId: number): { object: string; action: string; activate: () => void } | null {
    const plot = cityPlan().houses[houseId];
    const state = this.network.house(houseId);
    if (!plot || !state) return null;
    const style = HOUSE_STYLES[plot.style];
    if (state.owner === this.localSessionId) {
      return { object: 'Your home', action: state.locked ? 'Unlock door' : 'Lock door', activate: () => this.network.lockHouse(!state.locked) };
    }
    if (state.owner) {
      return state.locked ? { object: `${visibleName(state.ownerName)}'s home`, action: 'Knock', activate: () => this.network.say(0) } : null;
    }
    const owned = style.price === 0 || (this.self?.houseStyles.includes(style.index) ?? false);
    return {
      object: `${plot.address} - ${style.name}`,
      action: owned ? 'Move in' : `Buy ${formatMoney(style.price)}`,
      activate: () =>
        owned
          ? this.network.claimHouse(houseId, false)
          : this.confirm.confirm(`Buy this ${style.name}?`, `${plot.address} for ${formatMoney(style.price)}. Yours to keep: move into any free ${style.name} in any server.`, 'Buy it!', () => this.network.buyHouse(houseId, false), '#27ae60'),
    };
  }

  /** The suspect this officer is escorting, if any. */
  private escorted(): string | null {
    let found: string | null = null;
    this.network.players?.forEach((state, id) => {
      if (state.escort === this.localSessionId && state.status & STATUS.cuffed) found = id;
    });
    return found;
  }

  private openPlayerMenu(id: string): void {
    const state = this.network.player(id);
    if (!state || !this.self) return;
    this.audio.play('open');
    this.playerMenu.showFor({ id, name: state.displayName, job: state.job, cuffed: (state.status & STATUS.cuffed) !== 0 }, { job: this.self.job, money: this.self.money }, (action) => {
      if (action === 'give') this.network.giveMoney(id, 100);
      else this.network.playerAction(id, action);
    });
  }

  private atm(id: number): void {
    const self = this.self;
    this.choices.ask('ATM', `Balance: ${formatMoney(self?.money ?? 0)}`, [
      { text: self?.dailyReady ? 'Collect daily bonus' : 'Daily bonus collected', sub: self?.dailyReady ? 'Free money, once a day!' : 'Come back tomorrow', icon: 'star', color: '#f59f00', disabled: !self?.dailyReady, run: () => this.network.interact(id) },
      { text: 'Open the Bank app', icon: 'cash', color: '#2f9e44', run: () => this.phone.open('bank') },
    ], '#2f9e44');
  }

  private arcade(): void {
    const score = Math.floor(Math.random() * 9000) + 1000;
    this.audio.play('success');
    this.hud.toast(`Palm Racer: you scored ${score.toLocaleString('en-US')}!`, score > 8000 ? 'gold' : 'good');
  }

  private openShop(shop: ShopId): void {
    this.audio.play('open');
    this.shopWindow.show(shop, this.self);
  }

  private openShopsList(): void {
    this.choices.ask('Shopping', 'Where do you want to go? (sets your GPS)', [
      { text: 'Palm Motors', sub: 'Cars, boats, aircraft', icon: 'car', color: SHOPS.dealer.color, run: () => this.waypointToPlace('dealer') },
      { text: 'Coastline Threads', sub: 'Hats, shades, backpacks', icon: 'shirt', color: SHOPS.clothing.color, run: () => this.waypointToPlace('clothing') },
      { text: 'Casa Home', sub: 'Furniture & decor', icon: 'sofa', color: SHOPS.furniture.color, run: () => this.waypointToPlace('furniture') },
      { text: 'FreshMart', sub: 'Snacks & lifestyle items', icon: 'bag', color: SHOPS.grocery.color, run: () => this.waypointToPlace('grocery') },
      { text: 'Sunset Cafe', sub: 'Coffee & pastries', icon: 'food', color: SHOPS.cafe.color, run: () => this.waypointToPlace('cafe') },
      { text: 'Palm Burger', sub: 'Burgers, fries, shakes', icon: 'food', color: SHOPS.burger.color, run: () => this.waypointToPlace('burger') },
    ], '#c08bff');
  }

  private waypointToPlace(id: string): void {
    const place = city().placeById.get(id);
    if (!place) return;
    this.waypoint = { x: place.x, z: place.z, name: place.name };
    this.gpsTarget = null;
    this.hud.toast(`GPS set: ${place.name}`, 'info');
  }

  // ----------------------------------------------------------- labels

  private worldLabels(me: NetPlayerState | null): void {
    const player = this.localPlayer;
    if (!player) return;
    const px = player.position.x;
    const pz = player.position.z;
    // Homes nearby: who lives there, or what it costs.
    for (const plot of cityPlan().houses) {
      const d = Math.hypot(plot.x - px, plot.z - pz);
      if (d > 60) continue;
      const state = this.network.house(plot.id);
      const style = HOUSE_STYLES[plot.style];
      const b = cityPlan().buildings[plot.building]!;
      const front = houseToWorld(plot, 0, style.d / 2 + 3);
      if (state?.owner) this.overlay.label(`home:${plot.id}`, front.x, b.base + style.h + 3, front.z, `${visibleName(state.ownerName)}'s Home`, state.locked ? 'Locked' : '', true);
      else this.overlay.label(`home:${plot.id}`, front.x, b.base + 9, front.z, style.price === 0 ? 'FREE HOME' : 'FOR SALE', style.price === 0 ? style.name : `${style.name} - ${formatMoney(style.price)}`, true, '#9dffb0');
    }
    // Customers' orders.
    for (const [id, shop] of this.network.state?.shops?.entries() ?? []) {
      if (!shop.customer) continue;
      const at = this.life.customerAt(id as ShopId);
      if (!at || Math.hypot(at.x - px, at.z - pz) > 40) continue;
      const def = SHOPS[id as ShopId];
      const names = def.worker === 'chef' ? shop.order.split(',').map((k) => itemByKeyName(k)) : ['Checking out'];
      this.overlay.label(`order:${id}`, at.x, at.y + 5.4, at.z, names.join(' + '), shop.worker === this.localSessionId ? 'Your customer' : '', true);
    }
    // The job target and GPS beacons.
    const task = this.self?.task;
    if (task) {
      const color = task.kind === 'police' ? '#4d8dff' : task.kind === 'medic' ? '#ff5d6c' : task.kind === 'taxi' ? '#ffd23f' : task.kind === 'delivery' ? '#ffb547' : '#2ec4b6';
      const d = Math.hypot(task.x - px, task.z - pz);
      this.overlay.setBeacon(task.x, task.y + 3, task.z, `${Math.round(d)}m`, color);
    } else if (this.gpsTarget) {
      const state = this.network.player(this.gpsTarget);
      if (state) this.overlay.setBeacon(state.x, state.y + 6, state.z, `${visibleName(state.displayName)} ${Math.round(Math.hypot(state.x - px, state.z - pz))}m`, '#a29bfe');
      else this.gpsTarget = null;
    } else if (this.waypoint) {
      const d = Math.hypot(this.waypoint.x - px, this.waypoint.z - pz);
      if (d < 12) {
        this.hud.toast(`You've arrived: ${this.waypoint.name}`, 'good');
        this.waypoint = null;
      } else this.overlay.setBeacon(this.waypoint.x, 4, this.waypoint.z, `${this.waypoint.name} ${Math.round(d)}m`, '#ff4f8b');
    }
    // Name plates on or off.
    for (const [, remote] of this.remotePlayers.all()) remote.plate.sprite.visible = this.showNames;
    void me;
  }

  // ---------------------------------------------------------------- picks

  private rayFrom(x: number, y: number): void {
    this.pointer.set((x / this.renderer.width) * 2 - 1, -(y / this.renderer.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera.camera);
  }

  private handlePicks(): void {
    for (const pick of this.input.look.consumePicks()) {
      if (this.build.isOpen) {
        this.rayFrom(pick.x, pick.y);
        this.buildClick();
        continue;
      }
      // A click with a usable item in hand uses it.
      const held = itemById(this.self?.held ?? 0);
      if (held && held.use !== 'hold' && this.localPlayer?.mode === 'walk') this.useHeld();
    }
  }

  private equip(item: number): void {
    this.audio.play('click');
    this.network.equip(item);
  }

  private useHeld(): void {
    const item = itemById(this.self?.held ?? 0);
    if (!item) return;
    this.network.useItem();
    if (item.use === 'strum') this.network.note(Math.floor(Math.random() * 8), 'guitar');
  }

  // ----------------------------------------------------------- decorating

  private startDecorating(): void {
    const self = this.self;
    const player = this.localPlayer;
    if (!self || self.house < 0 || !player) {
      this.hud.toast('Move into a home first (Homes app).', 'info');
      return;
    }
    const plot = cityPlan().houses[self.house]!;
    if (!insideHouse(plot, player.position.x, player.position.z, -2)) {
      this.network.teleport('home');
      window.setTimeout(() => this.setBuilding(true), 600);
      return;
    }
    this.setBuilding(true);
  }

  private setBuilding(on: boolean): void {
    if (on === this.build.isOpen) return;
    this.build.setOpen(on);
    this.build.setState(this.self);
    this.phone.close();
    this.ghostKey = '';
    if (on) this.hud.toast('Decorate mode: pick furniture and click the floor.', 'info');
  }

  /** The point on the floor under the pointer, in house-local coordinates. */
  private floorPoint(): { x: number; z: number } | null {
    const self = this.self;
    if (!self || self.house < 0) return null;
    const plot = cityPlan().houses[self.house]!;
    this.plane.constant = -plot.base;
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (!hit) return null;
    return worldToHouse(plot, hit.x, hit.z);
  }

  private buildClick(): void {
    const self = this.self;
    if (!self || self.house < 0) return;
    const plot = cityPlan().houses[self.house]!;
    const local = this.floorPoint();
    if (!local) return;
    const x = Math.round(local.x * 2) / 2;
    const z = Math.round(local.z * 2) / 2;
    const house = this.network.house(self.house);
    if (this.build.moving) {
      this.network.placeFurniture(0, x, z, this.build.rot, this.build.moving);
      this.build.moving = 0;
      this.audio.play('click');
      this.ghostKey = '';
      return;
    }
    if (this.build.selected) {
      const pieces: { id: number; kind: number; x: number; z: number; rot: number }[] = [];
      house?.furniture?.forEach((f) => pieces.push({ id: f.id, kind: f.kind, x: f.x, z: f.z, rot: f.rot }));
      const problem = furnitureProblem(plot, pieces, this.build.selected, x, z, this.build.rot);
      if (problem) {
        this.hud.toast(problem, 'bad');
        this.audio.play('refuse');
        return;
      }
      this.network.placeFurniture(this.build.selected, x, z, this.build.rot);
      this.audio.play('click');
      return;
    }
    // Nothing picked: grab the piece under the pointer to move it.
    let best: { id: number; d: number } | null = null;
    house?.furniture?.forEach((f) => {
      const d = Math.hypot(f.x - local.x, f.z - local.z);
      const def = propById(f.kind);
      if (!def) return;
      if (d < Math.max(def.w, def.d) / 2 + 0.6 && (!best || d < best.d)) best = { id: f.id, d };
    });
    const found = best as { id: number; d: number } | null;
    if (found) {
      const piece = house?.furniture?.get(String(found.id));
      this.choices.ask(propById(piece?.kind ?? 0)?.name ?? 'Furniture', 'What do you want to do with it?', [
        { text: 'Move it', icon: 'hammer', color: '#4dabf7', run: () => this.build.pickMoving(found.id) },
        { text: 'Put in storage', icon: 'box', color: '#868e96', run: () => this.network.removeFurniture(found.id) },
      ], '#c08bff');
    }
  }

  private updateGhost(): void {
    const self = this.self;
    const kind = this.build.isOpen ? this.build.selected || (this.build.moving ? this.network.house(self?.house ?? -1)?.furniture?.get(String(this.build.moving))?.kind ?? 0 : 0) : 0;
    const pointer = this.input.look.pointer;
    if (!kind || !self || self.house < 0 || !pointer || this.input.look.dragging) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const plot = cityPlan().houses[self.house]!;
    const key = `${kind}`;
    if (key !== this.ghostKey || !this.ghost) {
      this.ghostKey = key;
      this.ghost?.removeFromParent();
      const def = propById(kind);
      if (!def) return;
      const b = new PartBuilder();
      buildProp(b, def.key);
      const group = b.build('ghost', false);
      group.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) mesh.material = this.ghostMaterial;
      });
      this.ghost = group;
      this.sceneManager.scene.add(group);
    }
    this.rayFrom(pointer.x, pointer.y);
    const local = this.floorPoint();
    if (!local || !this.ghost) return;
    const x = Math.round(local.x * 2) / 2;
    const z = Math.round(local.z * 2) / 2;
    const at = houseToWorld(plot, x, z);
    this.ghost.visible = true;
    this.ghost.position.set(at.x, plot.base + 0.06 + (propById(kind)?.wallY ?? 0), at.z);
    this.ghost.rotation.y = plot.rot + quarterYaw(this.build.rot);
    const pieces: { id: number; kind: number; x: number; z: number; rot: number }[] = [];
    this.network.house(self.house)?.furniture?.forEach((f) => pieces.push({ id: f.id, kind: f.kind, x: f.x, z: f.z, rot: f.rot }));
    const ok = furnitureProblem(plot, pieces, kind, x, z, this.build.rot, this.build.moving || -1) === null;
    this.ghostMaterial.color.setHex(ok ? 0x5aff7a : 0xff5a5a);
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(now: number, me: NetPlayerState | null): void {
    this.hud.setClock(this.atmosphere.clock);
    const player = this.localPlayer;
    if (!player) return;
    const px = player.position.x;
    const pz = player.position.z;
    // The vehicle HUD.
    const view = me?.vehicle ? this.vehicles.get(me.vehicle) : undefined;
    const state = me?.vehicle ? this.network.vehicle(me.vehicle) : null;
    this.vehicleHud.show(view?.def ?? null, me?.seat === 0);
    this.hud.setMode(!!view);
    if (view && state) {
      const speed = player.mode === 'drive' ? player.horizontalSpeed : Math.hypot(state.vx, state.vz);
      this.vehicleHud.update(speed, state.fuel, player.mode === 'drive' ? player.vehicle.nitro : state.nitro, state.flags, isAircraft(view.def) ? view.pose.y : null, this.radio);
    }
    // The task card.
    const task = this.self?.task ?? null;
    const hint = this.hint(me);
    this.hud.setTask(task, task ? Math.hypot(task.x - px, task.z - pz) : 0, hint);
    // Minimap and the map window.
    const markers: MapMarker[] = [];
    this.network.players?.forEach((state2, id) => {
      if (id === this.localSessionId) return;
      markers.push({ x: state2.x, z: state2.z, color: jobByIndex(state2.job).color === '#e8eef7' ? '#ffffff' : jobByIndex(state2.job).color, kind: 'player', label: state2.displayName });
    });
    if (this.self && this.self.house >= 0) {
      const plot = cityPlan().houses[this.self.house];
      if (plot) markers.push({ x: plot.x, z: plot.z, color: '#ff9f43', kind: 'home' });
    }
    if (task) markers.push({ x: task.x, z: task.z, color: '#ffd166', kind: 'task' });
    if (this.waypoint) markers.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#ff4f8b', kind: 'waypoint' });
    const speed = player.horizontalSpeed;
    this.hud.minimap.setRange(110 + Math.min(220, speed * 2.2));
    this.hud.minimap.draw(px, pz, this.input.look.yaw, player.mode === 'drive' ? player.vehicleView.yaw : player.character.root.rotation.y, markers);
    this.mapWindow.setState({ x: px, z: pz }, markers);
    // The phone.
    if (this.phone.isOpen) {
      const people: PhonePerson[] = [];
      this.network.players?.forEach((s, id) => {
        if (id !== this.localSessionId) people.push({ id, name: s.displayName, job: s.job, distance: Math.hypot(s.x - px, s.z - pz), avatarUrl: s.avatarUrl });
      });
      const houses: PhoneHouse[] = [];
      const list = this.network.state?.houses;
      if (list) for (let i = 0; i < list.length; i += 1) houses.push({ id: i, owner: list[i]!.owner, ownerName: list[i]!.ownerName, locked: list[i]!.locked });
      this.phone.setState(this.self, people, houses, this.self?.spawned ? (this.network.vehicle(this.self.spawned)?.kind ?? 0) : 0, this.atmosphere.clock, now);
      if (this.phone.live && Math.floor(this.time) !== Math.floor(this.time - 0.016)) this.phone.refresh();
    }
  }

  /** A nudge when there is no task. */
  private hint(me: NetPlayerState | null): string {
    const self = this.self;
    if (!self || !me) return '';
    if (me.status & STATUS.jailed) return `In jail... ${Math.max(0, Math.ceil((self.jailUntil - this.network.now()) / 1000))}s left`;
    if (me.status & STATUS.cuffed) return 'You are in handcuffs. Mash SPACE to struggle free!';
    if (self.task) return '';
    switch (self.job) {
      case 'taxi':
        return me.vehicle && this.vehicles.get(me.vehicle)?.def.key === 'taxi' ? 'Cruise around - a fare will call any moment.' : 'Spawn your Taxi from the phone (Vehicles > Job) to get fares.';
      case 'delivery':
        return 'Load parcels at the PalmPost depot counter.';
      case 'chef':
        return 'Stand behind the counter at Palm Burger or Sunset Cafe to take orders.';
      case 'clerk':
        return 'Stand behind the register at FreshMart or Coastline Threads.';
      case 'police':
      case 'medic':
        return 'Waiting for dispatch... patrol the city.';
      default:
        return self.house < 0 ? 'Get a free townhouse: open your phone > Homes.' : '';
    }
  }

  private trafficBlockers(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (const view of this.vehicles.all()) out.push({ x: view.pose.x, z: view.pose.z, r: view.def.length / 2 });
    const p = this.localPlayer?.position;
    if (p && this.localPlayer?.mode === 'walk') out.push({ x: p.x, z: p.z, r: 1.2 });
    for (const [, remote] of this.remotePlayers.all()) if (!remote.seated) out.push({ x: remote.position.x, z: remote.position.z, r: 1.2 });
    return out;
  }

  // ---------------------------------------------------------------- audio

  private updateAudio(delta: number, me: NetPlayerState | null): void {
    const player = this.localPlayer;
    if (!player) return;
    const p = player.position;
    if (this.time > this.envCheckAt) {
      this.envCheckAt = this.time + 0.4;
      // How near the open water is.
      let water = 0;
      for (const [r, w] of [[10, 1], [30, 0.7], [70, 0.4], [120, 0.18]] as const) {
        for (let a = 0; a < 8; a += 1) {
          if (!isLand(p.x + Math.cos((a / 8) * Math.PI * 2) * r, p.z + Math.sin((a / 8) * Math.PI * 2) * r)) {
            water = Math.max(water, w);
            break;
          }
        }
        if (water >= w) break;
      }
      this.oceanLevel = water;
      this.indoors = this.enterables.some(({ b }) => {
        const c = Math.cos(-b.rot);
        const s = Math.sin(-b.rot);
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const lx = dx * c + dz * s;
        const lz = -dx * s + dz * c;
        return Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2 && p.y < b.base + INTERIOR_HEIGHT;
      });
    }
    // Footsteps.
    if (player.mode === 'walk') {
      if (player.jumpedEdge) this.audio.play('jump', 0.6);
      if (player.landedEdge) this.audio.play('land', 0.5);
      if (player.splashedEdge) {
        this.audio.play('splash', 1);
        this.effects.splash(p.x, p.y + 2.2, p.z);
      }
      const speed = player.horizontalSpeed;
      if (speed > 2 && (player.isGrounded || player.swimming)) {
        this.stride += speed * delta;
        if (this.stride > (player.swimming ? 6 : 3.4)) {
          this.stride = 0;
          this.audio.play(player.swimming ? 'swim' : 'step', Math.min(1, speed / 20));
        }
      }
    }
    // Sirens: the loudest one in earshot.
    let siren = 0;
    for (const view of this.vehicles.all()) {
      if (!(view.flags & 2)) continue;
      const d = Math.hypot(view.pose.x - p.x, view.pose.z - p.z);
      siren = Math.max(siren, Math.max(0, 1 - d / 220));
    }
    this.sirenLevel += (siren - this.sirenLevel) * Math.min(1, delta * 4);
    const view = me?.vehicle ? this.vehicles.get(me.vehicle) : undefined;
    const driving = player.mode === 'drive' && view;
    this.audio.update({
      ocean: this.oceanLevel,
      indoors: this.indoors,
      engine: driving
        ? { speed: player.horizontalSpeed, max: view.def.handling.maxSpeed, throttle: Math.abs(this.input.sample().moveZ), kind: view.def.class }
        : null,
      siren: this.sirenLevel,
      radio: this.radio,
      inVehicle: !!view,
    });
    // Hospital wards beep.
    if (this.indoors && Math.floor(this.time) !== Math.floor(this.time - delta)) {
      const hospital = city().placeById.get('hospital');
      if (hospital && Math.hypot(hospital.x - p.x, hospital.z - p.z) < 60) this.audio.play('beep', 0.6);
    }
  }

  // ------------------------------------------------------------ server events

  private onSelf(state: SelfState): void {
    const before = this.self;
    this.self = state;
    this.hud.setSelf(state);
    this.shopWindow.setState(state);
    this.build.setState(state);
    this.life.syncTask(state.task);
    if (before && state.money > before.money) this.audio.play('cash', 0.8);
    if (before && state.job !== before.job) {
      const job = jobById(state.job);
      if (job && job.id !== 'civilian') this.hud.banner(`${job.title} on duty!`);
    }
    if (before?.task && !state.task) this.localPlayer?.character.cheer();
    if (!before?.task && state.task) this.audio.play('notify');
    if (this.phone.isOpen) this.phone.refresh();
  }

  private onNotice(message: NoticeMessage): void {
    this.hud.toast(message.text, message.kind);
    if (message.kind === 'bad') this.audio.play('refuse');
    else if (message.kind === 'gold') this.audio.play('success');
    else this.audio.play('notify');
  }

  private onChat(message: ChatMessage): void {
    const isMe = message.from === this.localSessionId;
    const remote = this.remotePlayers.get(message.from);
    const follow = (): { x: number; y: number; z: number } | null => {
      if (isMe) {
        const p = this.localPlayer?.character.root.position;
        return p ? { x: p.x, y: p.y + 6.6, z: p.z } : null;
      }
      const r = remote?.character.root.position;
      return r ? { x: r.x, y: r.y + 6.6, z: r.z } : null;
    };
    const at = follow();
    if (at) this.overlay.say(`chat:${message.from}`, message.text, at.x, at.y, at.z, 4.5, follow);
    this.audio.play('notify', 0.4);
    void CHAT_LINES;
  }

  private onFx(message: FxMessage): void {
    const p = this.localPlayer?.position;
    const d = p ? Math.hypot(message.x - p.x, message.z - p.z) : 0;
    const near = d < 120;
    const mine = message.who === this.localSessionId;
    switch (message.kind) {
      case 'cash':
        this.effects.cash(message.x, message.y, message.z);
        if (message.data && (mine || !message.who)) {
          const money = this.hud.moneyRect();
          this.overlay.pop(`${message.data > 0 ? '+' : '-'}${formatMoney(Math.abs(message.data))}`, message.data > 0 ? '#8dffb2' : '#ff9b9b', null, { x: money.left - 40, y: money.bottom + 20 });
        }
        break;
      case 'confetti':
        this.effects.confetti(message.x, message.y, message.z);
        if (near) this.audio.play('success');
        break;
      case 'crash':
        this.effects.sparks(message.x, message.y, message.z);
        if (near && !mine) this.audio.play('crash', Math.max(0.2, 1 - d / 120));
        break;
      case 'heal':
        this.effects.heal(message.x, message.y, message.z);
        if (near) this.audio.play('heal');
        break;
      case 'cuff':
        if (near) this.audio.play('cuff');
        this.effects.sparkle(message.x, message.y, message.z, 0x9ec5ff);
        break;
      case 'jail':
        if (near) this.audio.play('jail');
        break;
      case 'photo':
        this.effects.sparkle(message.x, message.y, message.z, 0xffffff);
        if (near) this.audio.play('photo');
        break;
      case 'eat':
        if (near) this.audio.play('eat', 0.7);
        break;
      case 'note':
        this.effects.notes(message.x, message.y, message.z);
        if (d < 70) this.audio.play((message.data ?? 0) >= 100 ? 'strum' : 'note', 1 - d / 80, 2 ** (((message.data ?? 0) % 100) / 12));
        break;
      case 'fish':
        this.effects.splash(message.x + Math.sin(this.localPlayer?.yaw ?? 0) * 6, -1, message.z + Math.cos(this.localPlayer?.yaw ?? 0) * 6);
        if (near) this.audio.play('fish');
        break;
      case 'party':
        this.effects.confetti(message.x, message.y + 2, message.z);
        if (near) this.audio.play('party', 0.7);
        break;
      case 'door':
        if (near) this.audio.play('door');
        break;
      case 'wave':
        if (near) this.effects.sparkle(message.x, message.y, message.z, 0xffd166);
        break;
      case 'splash':
        this.effects.splash(message.x, message.y, message.z);
        break;
      case 'horn':
        break;
    }
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
    if (status === 'disconnected' || status === 'error') this.hud.toast('Disconnected from the server. Reload to rejoin.', 'bad');
  }

  // ------------------------------------------------------------- settings

  private loadSettings(): void {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw) as Partial<typeof this.settings>);
    } catch {
      /* defaults */
    }
    this.showNames = this.settings.names;
  }

  private applySetting(key: 'music' | 'sfx' | 'quality' | 'names' | 'sensitivity', value: number | string | boolean): void {
    switch (key) {
      case 'music':
        this.settings.music = Number(value);
        this.audio.setMusicVolume(this.settings.music);
        break;
      case 'sfx':
        this.settings.sfx = Number(value);
        this.audio.setSfxVolume(this.settings.sfx);
        break;
      case 'quality':
        this.settings.quality = String(value);
        this.renderer.setQuality(this.settings.quality);
        break;
      case 'names':
        this.settings.names = Boolean(value);
        this.showNames = this.settings.names;
        break;
      case 'sensitivity':
        this.settings.sensitivity = Number(value);
        this.input.look.setSensitivityScale(this.settings.sensitivity);
        break;
    }
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* not saved */
    }
  }

  // ------------------------------------------------------------- keyboard

  private vehicleKey(): void {
    const me = this.localSessionId ? this.network.player(this.localSessionId) : null;
    if (me?.vehicle) this.network.exitVehicle();
    else this.overlay.activateKey('F');
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    if (event.repeat && event.code !== 'Space') return;
    const code = event.code;
    if (code === 'Escape') {
      if (this.phone.isOpen) this.phone.close();
      else if (closeTopModal()) return;
      else if (this.build.isOpen) this.setBuilding(false);
      else this.bloxity.showPortalMenu(false);
      return;
    }
    if (this.menu.isOpen) {
      if (code === 'Enter' || code === 'Space') this.play('civilian');
      return;
    }
    const me = this.localSessionId ? this.network.player(this.localSessionId) : null;
    // Cuffed: SPACE struggles.
    if (code === 'Space' && me && me.status & STATUS.cuffed) {
      if (!this.cuffedPress) this.network.struggle();
      this.cuffedPress = true;
      window.setTimeout(() => (this.cuffedPress = false), 60);
      return;
    }
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      if (anyModalOpen()) return;
      const n = Number(digit[1]);
      // At the piano, the number keys play.
      if (me && me.pose !== POSE.stand && this.nearPiano()) {
        this.network.note(n - 1, 'piano');
        return;
      }
      const item = this.hud.slot(n);
      if (item) this.equip(this.self?.held === item ? 0 : item);
      return;
    }
    if (anyModalOpen()) return;
    switch (code) {
      case 'KeyE':
        if (!this.overlay.activateKey('E')) this.overlay.activateKey('SPACE');
        break;
      case 'KeyF':
        this.vehicleKey();
        break;
      case 'KeyP':
      case 'Tab':
        event.preventDefault();
        this.phone.toggle();
        break;
      case 'KeyM':
        this.mapWindow.open();
        break;
      case 'KeyB':
        this.phone.open('emotes');
        break;
      case 'KeyT':
        this.phone.open('chat');
        break;
      case 'KeyV':
        this.cycleCamera();
        break;
      case 'KeyL':
        this.network.vehicleAction('lights');
        break;
      case 'KeyH':
        this.network.vehicleAction('horn');
        break;
      case 'KeyG':
        this.network.vehicleAction('siren');
        break;
      case 'KeyK':
        this.network.vehicleAction('lock');
        break;
      case 'KeyR':
        if (this.build.isOpen) this.build.rotate();
        break;
      case 'KeyQ':
        this.useHeld();
        break;
      case 'KeyN':
        this.audio.toggleMuted();
        break;
      default:
        break;
    }
  };

  private nearPiano(): boolean {
    const p = this.localPlayer?.position;
    if (!p) return false;
    return city().interactables.some((i) => i.kind === 'piano' && Math.hypot(i.bx - p.x, i.bz - p.z) < 6) || this.homePianoNear(p);
  }

  private homePianoNear(p: Vector3): boolean {
    const self = this.self;
    if (!self || self.house < 0) return false;
    const plot = cityPlan().houses[self.house]!;
    let found = false;
    this.network.house(self.house)?.furniture?.forEach((f) => {
      if (propById(f.kind)?.key !== 'piano') return;
      const at = houseToWorld(plot, f.x, f.z);
      if (Math.hypot(at.x - p.x, at.z - p.z) < 6) found = true;
    });
    return found;
  }

  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.5) return;
    this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS`;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }

  private timeWarp = 0;

  /** Dev handle: look at the city at a given hour (this client only). */
  setHour(hour: number): void {
    const now = this.network.now();
    const want = ((hour / 24 - timeOfDay(now)) % 1 + 1) % 1;
    this.timeWarp = want * DAY_SECONDS * 1000;
  }

  /** Dev handle: jump somewhere, add money. */
  dev(payload: Record<string, unknown>): void {
    this.network.dev(payload);
  }

  get debugState(): Record<string, unknown> {
    const p = this.localPlayer;
    return { mode: p?.mode, position: p ? [p.position.x, p.position.y, p.position.z] : null, self: this.self, vehicles: [...this.vehicles.all()].map((v) => v.id), jobs: JOBS.length, emotes: EMOTES.length };
  }

  dispose(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    void this.network.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('pointerdown', this.onGesture);
    this.hud.dispose();
    this.vehicleHud.dispose();
    this.overlay.dispose();
    this.phone.dispose();
    this.shopWindow.dispose();
    this.mapWindow.dispose();
    this.choices.dispose();
    this.confirm.dispose();
    this.playerMenu.dispose();
    this.build.dispose();
    this.menu.dispose();
    this.touch.dispose();
    this.icons.dispose();
    this.dresser?.dispose();
    this.bloxity.dispose();
    this.bloxityPanel.dispose();
    this.audio.dispose();
    this.remotePlayers.dispose();
    this.vehicles.dispose();
    this.effects.dispose();
    this.cityView.dispose();
    this.homes.dispose();
    this.life.dispose();
    this.traffic.dispose();
    this.sea.dispose();
    this.sky.dispose();
    this.renderer.dispose();
  }
}

const propIdByKey = (key: string): number => {
  for (let id = 1; id < 400; id += 1) {
    const def = propById(id);
    if (!def) break;
    if (def.key === key) return id;
  }
  return 0;
};

const itemByKeyName = (key: string): string => {
  for (let id = 1; id < 200; id += 1) {
    const item = itemById(id);
    if (!item) break;
    if (item.key === key) return item.name;
  }
  return key;
};
