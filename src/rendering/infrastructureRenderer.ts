import type { InfrastructureLayout, Point } from '../types';
import { Camera } from './camera';

const TILE_SIZE = 32;

const ENTITY_ICONS: Record<string, { color: string; symbol: string }> = {
  PortableGeneratorPacman: { color: '#ff6600', symbol: 'G' },
  SMESBasic: { color: '#ffaa00', symbol: 'S' },
  SubstationBasic: { color: '#ffcc00', symbol: 'T' },
  APCBasic: { color: '#00ff00', symbol: 'A' },
  GasVentPump: { color: '#00ccff', symbol: 'V' },
  GasVentScrubber: { color: '#0088ff', symbol: 'X' },
  AirAlarm: { color: '#ff4444', symbol: '!' },
  AirSensor: { color: '#00aacc', symbol: 'a' },
  FireAlarm: { color: '#ff2222', symbol: 'F' },
  Firelock: { color: '#cc3300', symbol: 'K' },
  Poweredlight: { color: '#ffffaa', symbol: 'L' },
  PoweredSmallLight: { color: '#dddd88', symbol: 'l' },
  EmergencyLight: { color: '#ff8800', symbol: 'E' },
  SurveillanceCameraEngineering: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraSecurity: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraScience: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraSupply: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraCommand: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraService: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraMedical: { color: '#88aaff', symbol: 'C' },
  SurveillanceCameraGeneral: { color: '#88aaff', symbol: 'C' },
  IntercomCommon: { color: '#aaddaa', symbol: 'I' },
  IntercomCommand: { color: '#aaddaa', symbol: 'I' },
  IntercomEngineering: { color: '#aaddaa', symbol: 'I' },
  IntercomMedical: { color: '#aaddaa', symbol: 'I' },
  IntercomScience: { color: '#aaddaa', symbol: 'I' },
  IntercomSecurity: { color: '#aaddaa', symbol: 'I' },
  IntercomService: { color: '#aaddaa', symbol: 'I' },
  IntercomSupply: { color: '#aaddaa', symbol: 'I' },
  DisposalUnit: { color: '#8888cc', symbol: 'D' },
  ExtinguisherCabinetFilled: { color: '#ff3333', symbol: 'e' },
  StationMap: { color: '#44ff44', symbol: 'M' },
  GravityGenerator: { color: '#aa44ff', symbol: 'g' },
  SpawnPointLatejoin: { color: '#00ff00', symbol: 'J' },
  FaxMachineBase: { color: '#888888', symbol: 'F' },
  Bed: { color: '#8B4513', symbol: 'B' },
  ComputerComms: { color: '#4488ff', symbol: 'C' },
  ComputerId: { color: '#4488ff', symbol: 'C' },
  CryoPod: { color: '#44ddff', symbol: 'Y' },
  Recycler: { color: '#88cc44', symbol: 'R' },
  TableReinforced: { color: '#8B7355', symbol: 'T' },
  Table: { color: '#8B7355', symbol: 'T' },
  ChairOfficeDark: { color: '#444466', symbol: 'c' },
  ChairOffice: { color: '#666688', symbol: 'c' },
  PottedPlantRandom: { color: '#22AA22', symbol: 'P' },
  Catwalk: { color: '#666666', symbol: '#' },
  SolarPanel: { color: '#4488CC', symbol: 'S' },
  Holopad: { color: '#44CCFF', symbol: 'H' },
  RandomSpawner: { color: '#CCCC44', symbol: '?' },
};

const CABLE_COLORS: Record<string, { color: string; width: number }> = {
  CableHV: { color: '#ff6622', width: 3 },
  CableMV: { color: '#ddcc00', width: 2 },
  CableApcExtension: { color: '#22cc44', width: 1 },
};

function tileToScreen(
  tx: number, ty: number,
  camera: Camera, canvasW: number, canvasH: number,
): [number, number] {
  const tileScreenSize = TILE_SIZE * camera.zoom;
  const screenOffsetX = canvasW / 2 - camera.x * tileScreenSize;
  const screenOffsetY = canvasH / 2 - camera.y * tileScreenSize;
  return [tx * tileScreenSize + screenOffsetX, ty * tileScreenSize + screenOffsetY];
}

export function renderInfrastructure(
  ctx: CanvasRenderingContext2D,
  infra: InfrastructureLayout,
  camera: Camera,
  canvasW: number,
  canvasH: number,
  showCables: boolean,
  showPipes: boolean,
  showEntities: boolean,
) {
  const tileScreenSize = TILE_SIZE * camera.zoom;

  if (showCables) {
    for (const cable of infra.cableSegments) {
      const style = CABLE_COLORS[cable.type];
      if (!style) continue;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.globalAlpha = cable.type === 'CableApcExtension' ? 0.3 : 0.7;
      if (cable.type === 'CableApcExtension') {
        ctx.fillStyle = style.color;
        for (const tile of cable.tiles) {
          const [sx, sy] = tileToScreen(tile.x + 0.5, tile.y + 0.5, camera, canvasW, canvasH);
          ctx.fillRect(sx - 1, sy - 1, 2, 2);
        }
      } else {
        drawPathLine(ctx, cable.tiles, camera, canvasW, canvasH);
      }
      ctx.globalAlpha = 1;
    }
  }

  if (showPipes) {
    ctx.strokeStyle = '#00bbdd';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (const pipe of infra.pipeSegments) {
      drawPathLine(ctx, pipe.tiles, camera, canvasW, canvasH);
    }
    ctx.strokeStyle = '#8866cc';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    for (const pipe of infra.disposalSegments) {
      drawPathLine(ctx, pipe.tiles, camera, canvasW, canvasH);
    }
    ctx.globalAlpha = 1;
  }

  if (showEntities) {
    const radius = Math.max(4, Math.min(8, 6 * camera.zoom));
    const fontSize = Math.max(8, Math.min(12, 10 * camera.zoom));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const entity of infra.entities) {
      const icon = ENTITY_ICONS[entity.prototype];
      if (!icon) continue;

      const [sx, sy] = tileToScreen(entity.position.x + 0.5, entity.position.y + 0.5, camera, canvasW, canvasH);
      ctx.fillStyle = icon.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.globalAlpha = 1;
      ctx.fillText(icon.symbol, sx, sy);
    }
  }
}

function drawPathLine(
  ctx: CanvasRenderingContext2D,
  tiles: Point[],
  camera: Camera,
  canvasW: number,
  canvasH: number,
) {
  if (tiles.length < 2) return;
  ctx.beginPath();
  const [sx, sy] = tileToScreen(tiles[0].x + 0.5, tiles[0].y + 0.5, camera, canvasW, canvasH);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < tiles.length; i++) {
    const [px, py] = tileToScreen(tiles[i].x + 0.5, tiles[i].y + 0.5, camera, canvasW, canvasH);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}
