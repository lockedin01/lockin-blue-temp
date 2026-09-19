'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Layers,
  Wrench,
  CheckCircle2,
  Settings,
  Play,
  Square,
  RotateCcw,
} from 'lucide-react';
import { type ModularSimData } from './modular-simulation-viewer';

interface BOMItem {
  itemNo: number;
  partId: string;
  name: string;
  partNumber: string;
  material: string;
  qty: number;
  torqueOrTolerance: string;
  inspectionCriteria: string;
  accentColor?: string;
}

interface ExplodablePart {
  id: string;
  itemNo: number;
  name: string;
  group: THREE.Group;
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
  explodeDelta: THREE.Vector3;
  isCasing?: boolean;
}

export function Exploded3DView({ sim }: { sim: ModularSimData }) {
  const isBentAxisPump =
    sim.id === '2253' ||
    sim.title.toLowerCase().includes('bent axis') ||
    sim.slug.toLowerCase().includes('bent-axis');

  const isDynex =
    sim.id === '2236' ||
    sim.title.toLowerCase().includes('dynex') ||
    sim.slug.toLowerCase().includes('dynex') ||
    sim.title.toLowerCase().includes('checkball');

  // Interactive 3D HUD states (matching reference screenshot)
  const [explodeValue, setExplodeValue] = useState<number>(isDynex ? 0.8 : 0.75); // 0 = assembled, 1 = exploded
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [allLabels, setAllLabels] = useState<boolean>(true);
  const [showControlsHint, setShowControlsHint] = useState<boolean>(true);
  const [isCutaway, setIsCutaway] = useState<boolean>(false);
  const [selectedItemNo, setSelectedItemNo] = useState<number>(1);
  const [, setHoveredPartName] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Canvas and 3D refs
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const explodablePartsRef = useRef<ExplodablePart[]>([]);
  const casingMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const reqAnimFrameRef = useRef<number | null>(null);
  const explodeTargetRef = useRef<number>(explodeValue);
  const explodeCurrentRef = useRef<number>(explodeValue);
  const isSpinningRef = useRef<boolean>(isSpinning);
  const spinAngleRef = useRef<number>(0);
  const dynexSpinPartsRef = useRef<{
    camshaft?: THREE.Group;
    holddown?: THREE.Group;
    pistons?: { group: THREE.Group; baseZ: number; phase: number }[];
    bentAxisBarrel?: THREE.Group;
  }>({});
  const [labelPositions, setLabelPositions] = useState<{ id: string; name: string; itemNo: number; x: number; y: number; visible: boolean }[]>([]);

  // Keep target explode value & spinning state updated in refs
  useEffect(() => {
    explodeTargetRef.current = explodeValue;
  }, [explodeValue]);

  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  // Bill of materials data
  const bomItems: BOMItem[] = useMemo(() => {
    if (isBentAxisPump) {
      return [
        {
          itemNo: 1,
          partId: 'shaft_seal',
          name: 'Rotary Shaft Seal & Viton Wiper',
          partNumber: 'BAP-45-72-8-FKM',
          material: 'Fluoroelastomer (FKM / Viton 80 Shore)',
          qty: 1,
          torqueOrTolerance: 'Radial lip preload 0.35 bar max',
          inspectionCriteria: 'Inspect sealing lip for elastomer hardening, axial scoring, or thermal breakdown.',
          accentColor: '#1e293b',
        },
        {
          itemNo: 2,
          partId: 'circlip',
          name: 'Internal Retaining Circlip Ring',
          partNumber: 'DIN-472-72x2.5',
          material: 'Spring Steel (Carbon C75S, Phosphated)',
          qty: 1,
          torqueOrTolerance: 'Snap fit into internal groove (depth 2.1mm)',
          inspectionCriteria: 'Check for plastic yield or opening distortion. Must be renewed at every overhaul.',
          accentColor: '#334155',
        },
        {
          itemNo: 3,
          partId: 'bearing_flange',
          name: 'Drive Shaft & Front SAE 4-Bolt Flange',
          partNumber: 'SHF-BA-28K-SAE',
          material: 'Case Hardened Alloy Steel (16MnCr5 ground)',
          qty: 1,
          torqueOrTolerance: 'Keyway ISO 773 / DIN 6885; Runout < 0.008mm',
          inspectionCriteria: 'Inspect spline/keyway contact flanks for fretting corrosion and bearing seat pitting.',
          accentColor: '#94a3b8',
        },
        {
          itemNo: 4,
          partId: 'main_housing',
          name: 'Bent-Axis Main Housing Body (40° Angle)',
          partNumber: 'HSG-BA-055-M-40',
          material: 'Ductile Cast Iron (EN-GJS-400 / GGG-40)',
          qty: 1,
          torqueOrTolerance: 'Pilot spigot Ø125.00 +0.025/-0 mm',
          inspectionCriteria: 'Pressure test casting cavity up to 420 bar. Verify zero porosity or hairline fractures.',
          accentColor: '#ea580c',
        },
        {
          itemNo: 5,
          partId: 'rotating_group',
          name: '7x Axial Piston & Cylinder Barrel Group',
          partNumber: 'CYL-ROT-7P-55',
          material: 'High-Tensile Bimetal Alloy / Lead Bronze Bores',
          qty: 1,
          torqueOrTolerance: 'Piston-to-bore diametral clearance 0.009 mm',
          inspectionCriteria: 'Inspect spherical ball head shoes for fretting, cavitation micro-pitting, and scuffing.',
          accentColor: '#f59e0b',
        },
        {
          itemNo: 6,
          partId: 'valve_plate',
          name: 'Spherical Valve Timing Plate (Kidney Ports)',
          partNumber: 'PLT-TIM-VLV-55',
          material: 'Carburized Tool Steel with Bronze Facing',
          qty: 1,
          torqueOrTolerance: 'Surface flatness 0.002 mm (3 helium light bands)',
          inspectionCriteria: 'Check kidney port separation bridges for wire-draw cavitation and fluid erosion.',
          accentColor: '#64748b',
        },
        {
          itemNo: 7,
          partId: 'port_cover',
          name: 'Rear Port Cover & SAE High-Pressure Block',
          partNumber: 'BLK-PORT-BA-SAE',
          material: 'Nodular Iron (EN-GJS-600 Quenched & Tempered)',
          qty: 1,
          torqueOrTolerance: 'SAE 1-1/4" Code 62 (6000 PSI rating)',
          inspectionCriteria: 'Verify internal gallery transitions are free from burrs and casting core sand residue.',
          accentColor: '#ea580c',
        },
        {
          itemNo: 8,
          partId: 'cap_screws',
          name: 'High-Tensile Housing Screws (4x M12)',
          partNumber: 'DIN-912-M12x65-10.9',
          material: 'Grade 10.9 Alloy Steel (Geomet Coated)',
          qty: 4,
          torqueOrTolerance: 'Torque to 85 Nm in criss-cross sequence',
          inspectionCriteria: 'Inspect thread lead for stretching. Replace any fastener showing thread necking.',
          accentColor: '#475569',
        },
      ];
    } else if (isDynex) {
      return [
        {
          itemNo: 1,
          partId: 'shaft_snap_ring',
          name: 'External Drive Shaft Snap Ring',
          partNumber: 'DIN-471-25x1.2',
          material: 'Carbon Spring Steel (C75S, Phosphated & Oiled)',
          qty: 1,
          torqueOrTolerance: 'Groove diameter Ø23.90 ±0.05 mm',
          inspectionCriteria: 'Verify zero permanent expansion or burrs. Always renew at major service.',
          accentColor: '#1e293b',
        },
        {
          itemNo: 2,
          partId: 'housing_circlip',
          name: 'Internal Housing Retaining Circlip',
          partNumber: 'DIN-472-52x2.0',
          material: 'High-Tensile Spring Steel (Phosphate Coated)',
          qty: 1,
          torqueOrTolerance: 'Internal housing groove depth 1.6 mm',
          inspectionCriteria: 'Check snap ring eyes for distortion and verify 100% circumferential seating.',
          accentColor: '#334155',
        },
        {
          itemNo: 3,
          partId: 'front_ball_bearing',
          name: 'Front Radial Deep-Groove Ball Bearing',
          partNumber: 'BRG-6205-C3-SKF',
          material: 'Vacuum Degassed Bearing Steel (100Cr6 / 52100)',
          qty: 1,
          torqueOrTolerance: 'Radial clearance C3 (0.015 - 0.030 mm)',
          inspectionCriteria: 'Spin test for raceway roughness. Inspect balls and cage for micro-brinelling or fretting.',
          accentColor: '#94a3b8',
        },
        {
          itemNo: 4,
          partId: 'main_casing',
          name: 'Teal Casing Body (SAE Flange & DYNEX Badge)',
          partNumber: 'HSG-DYN-PV40-TL',
          material: 'Ductile Cast Iron (EN-GJS-400 / Teal Powder Coat)',
          qty: 1,
          torqueOrTolerance: 'SAE 2-Bolt Pilot Spigot Ø101.60 +0.025/-0 mm',
          inspectionCriteria: 'Inspect side inspection port rim and mounting flange ears for hairline casting micro-fractures.',
          accentColor: '#48a8b8',
        },
        {
          itemNo: 5,
          partId: 'shaft_seal',
          name: 'High-Pressure Fluorocarbon Shaft Seal',
          partNumber: 'SEAL-FKM-30-50-7',
          material: 'Viton FKM 80 Shore A + Stainless Garter Spring',
          qty: 1,
          torqueOrTolerance: 'Max continuous case pressure 1.7 bar (25 PSI)',
          inspectionCriteria: 'Inspect sealing lip for elastomeric glazing, axial shaft scoring, or thermal hardening.',
          accentColor: '#1e293b',
        },
        {
          itemNo: 6,
          partId: 'camshaft_swashplate',
          name: 'Camshaft & 15° Wobble Swashplate Cam',
          partNumber: 'DYN-SFT-WOB-15',
          material: 'Forged Nitrided Alloy Steel (Case Hardened 62 HRC)',
          qty: 1,
          torqueOrTolerance: 'Fixed wobble angle 15.0° ±0.05°; Stroke 4.80 mm',
          inspectionCriteria: 'Inspect polished wobble contact face for galling, spalling pits, or heat discoloration.',
          accentColor: '#cbd5e1',
        },
        {
          itemNo: 7,
          partId: 'holddown_plate',
          name: 'Bronze Slipper Holddown Ring & Shoes',
          partNumber: 'RNG-HDN-BRZ-05',
          material: 'Bearing Phosphor Bronze (CuSn8P)',
          qty: 1,
          torqueOrTolerance: 'Slipper socket axial running clearance 0.03 - 0.05 mm',
          inspectionCriteria: 'Measure slipper shoe pocket wear; excess play causes shoe detachment at 1800 RPM.',
          accentColor: '#d97706',
        },
        {
          itemNo: 8,
          partId: 'checkball_pistons',
          name: '5x Hollow Checkball Piston Plungers & Springs',
          partNumber: 'PST-CK-10K-05',
          material: '100Cr6 Sub-Zero Treated Tool Steel (64 HRC)',
          qty: 5,
          torqueOrTolerance: 'Plunger-to-bore diametral clearance 0.007 - 0.009 mm',
          inspectionCriteria: 'Ultrasonically clean hollow plungers. Vacuum test internal inlet ball seat (25 in-Hg).',
          accentColor: '#38bdf8',
        },
        {
          itemNo: 9,
          partId: 'stationary_barrel',
          name: 'Stationary Cylinder Barrel (6 Cap Screws)',
          partNumber: 'BRL-DYN-5B-STAT',
          material: 'Austempered Ductile Iron (ADI Grade 1200)',
          qty: 1,
          torqueOrTolerance: '6x Perimeter socket screws torqued to 55 Nm',
          inspectionCriteria: 'Check 5 micro-honed bores (Ra 0.15 µm) for longitudinal scoring or cavitation wash.',
          accentColor: '#475569',
        },
        {
          itemNo: 10,
          partId: 'discharge_check_valves',
          name: '5x Outlet Discharge Checkballs & Conical Springs',
          partNumber: 'VLV-DISC-CK-10K',
          material: 'Stainless Steel 440C Ground Balls + 17-7PH Springs',
          qty: 5,
          torqueOrTolerance: 'Discharge pressure rating 10,000 PSI (700 bar)',
          inspectionCriteria: 'Examine checkball seating line under 10x loupe for wire-draw erosion or micro-notching.',
          accentColor: '#f1f5f9',
        },
        {
          itemNo: 11,
          partId: 'full_flow_cover',
          name: 'Full Flow Head Cover (10,000 PSI Port & 4 Bolts)',
          partNumber: 'CVR-DISC-DYN-10K',
          material: 'Heavy Forged High-Strength Steel (Teal Painted)',
          qty: 1,
          torqueOrTolerance: '4x M14 Clamping Bolts torqued to 140 Nm',
          inspectionCriteria: 'Inspect internal annular high-pressure discharge gallery for micro-fissures.',
          accentColor: '#48a8b8',
        },
      ];
    } else {
      return [
        {
          itemNo: 1,
          partId: 'end_plug',
          name: 'Retaining End Plug & Seal Carrier',
          partNumber: `CAP-${sim.id}-01`,
          material: 'Medium Carbon Steel (AISI 1045)',
          qty: 2,
          torqueOrTolerance: 'Hex torque 45 Nm with annealed copper ring',
          inspectionCriteria: 'Inspect thread lead and O-ring seat for burrs or thread galling.',
          accentColor: '#64748b',
        },
        {
          itemNo: 2,
          partId: 'centering_spring',
          name: 'Bias / Centering Coil Springs',
          partNumber: `SPR-${sim.id}-CR`,
          material: 'Silicon-Chromium Spring Steel (EN 10270-2)',
          qty: 2,
          torqueOrTolerance: 'Spring rate 28 N/mm; 120N preload',
          inspectionCriteria: 'Inspect coils for fretting, cracking, or permanent relaxation (> 1.5mm free length loss).',
          accentColor: '#e2e8f0',
        },
        {
          itemNo: 3,
          partId: 'precision_spool',
          name: 'Precision-Lapped Metering Spool',
          partNumber: `SPL-${sim.id}-4W`,
          material: '16MnCr5 Tool Steel (Case Hardened 60 HRC)',
          qty: 1,
          torqueOrTolerance: 'Radial clearance 0.005 - 0.008 mm',
          inspectionCriteria: 'Solvent slide test: spool must drop smoothly through washed valve bore without binding.',
          accentColor: '#94a3b8',
        },
        {
          itemNo: 4,
          partId: 'seals_pack',
          name: 'Dynamic O-Rings with PTFE Backup Rings',
          partNumber: `SEAL-${sim.id}-DUO`,
          material: 'NBR 90 + Virgin PTFE Concave Ring',
          qty: 4,
          torqueOrTolerance: 'Operating pressure limit 350 bar (5,000 PSI)',
          inspectionCriteria: 'Check for nibbling, spiraling, or extrusion. Lubricate with ISO 46 oil prior to install.',
          accentColor: '#1e293b',
        },
        {
          itemNo: 5,
          partId: 'manifold_body',
          name: 'Hydraulic Manifold Casing Body',
          partNumber: `MNF-${sim.id}-DUCT`,
          material: 'High-Density Cast Iron (EN-GJS-400)',
          qty: 1,
          torqueOrTolerance: 'Bore finish Ra 0.4 µm honed',
          inspectionCriteria: 'Inspect internal gallery transitions for contamination, burrs, or cavitation erosion.',
          accentColor: '#2563eb',
        },
      ];
    }
  }, [isBentAxisPump, isDynex, sim.id]);

  // Selected BOM item
  const selectedItem = bomItems.find((i) => i.itemNo === selectedItemNo) || bomItems[0];

  // Helper: Reset camera perspective and positions
  const resetCamera = () => {
    setIsSpinning(false);
    setExplodeValue(0);
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const startPos = camera.position.clone();
    const targetPos = isDynex
      ? new THREE.Vector3(4.5, 2.2, 0.6)
      : new THREE.Vector3(3.2, 2.2, 4.4);
    const startTarget = controls.target.clone();
    const endTarget = isDynex
      ? new THREE.Vector3(0, 0, 0.4)
      : new THREE.Vector3(0, 0, 0);

    let step = 0;
    const animateReset = () => {
      step += 0.05;
      camera.position.lerpVectors(startPos, targetPos, Math.min(step, 1));
      controls.target.lerpVectors(startTarget, endTarget, Math.min(step, 1));
      controls.update();
      if (step < 1) {
        requestAnimationFrame(animateReset);
      }
    };
    animateReset();
  };

  // Build the 3D Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xfcfdfd);

    // 2. Camera Setup
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 540;
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    if (isDynex) {
      camera.position.set(4.5, 2.2, 0.6);
    } else {
      camera.position.set(3.2, 2.2, 4.4);
    }
    cameraRef.current = camera;

    // 3. Renderer Setup with Error Handling & Fallback
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      console.warn('WebGL context creation fallback:', err);
      container.innerHTML =
        '<div class="flex items-center justify-center h-full text-slate-500 font-semibold text-sm">WebGL is initializing or hardware acceleration is disabled.</div>';
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.2;
    controls.maxDistance = 14;
    if (isDynex) {
      controls.target.set(0, 0, 0.4);
    } else {
      controls.target.set(0, 0, 0);
    }
    controlsRef.current = controls;

    // 5. Lighting Setup (Industrial Studio HDRI Style)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(6, 12, 8);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 1.0);
    dirLight2.position.set(-6, -2, -6);
    scene.add(dirLight2);

    const fillLight = new THREE.DirectionalLight(0xffedd5, 0.5);
    fillLight.position.set(0, -6, 6);
    scene.add(fillLight);

    // Soft ground contact shadow plane
    const shadowPlaneGeo = new THREE.PlaneGeometry(16, 16);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.8;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Shared Materials
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.92,
      roughness: 0.22,
    });

    const groundShaftMat = new THREE.MeshStandardMaterial({
      color: 0xe5e7eb,
      metalness: 0.95,
      roughness: 0.15,
    });

    const industrialOrangeMat = new THREE.MeshStandardMaterial({
      color: 0xeb6b0a, // Genuine bent-axis pump safety orange
      metalness: 0.25,
      roughness: 0.38,
    });

    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.78,
      roughness: 0.25,
    });

    const darkSealMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.1,
    });

    const darkBoltMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.35,
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.06,
    });

    const casingMaterials: THREE.MeshStandardMaterial[] = [industrialOrangeMat];
    casingMaterialsRef.current = casingMaterials;

    // Array to store exploded subassembly parts
    const explodableParts: ExplodablePart[] = [];
    const dynexPistonsList: { group: THREE.Group; baseZ: number; phase: number }[] = [];

    // Helper: Dynamic DYNEX Logo Canvas Texture
    const createDynexBadgeTexture = () => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d');
      if (ctx) {
        // Brushed metallic silver background
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 512, 256);

        // Blue accent bar on left
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(16, 16, 24, 224);

        // Blue accent bar on right
        ctx.fillRect(472, 16, 24, 224);

        // Dark text DYNEX
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 84px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DYNEX', 256, 128);

        // Rivet corners
        ctx.fillStyle = '#334155';
        [
          [28, 28],
          [484, 28],
          [28, 228],
          [484, 228],
        ].forEach(([rx, ry]) => {
          ctx.beginPath();
          ctx.arc(rx, ry, 6, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    };

    // --- PROCEDURAL 3D MECHANICAL MODEL BUILDER ---
    if (isBentAxisPump) {
      // Bent-Axis angle: 40° in radians
      const BENT_RAD = (40 * Math.PI) / 180;
      const cos40 = Math.cos(BENT_RAD);
      const sin40 = Math.sin(BENT_RAD);
      const bentDir = new THREE.Vector3(0, -sin40, cos40).normalize();

      // PART 1: Rotary Shaft Seal & Viton Wiper
      const sealGroup = new THREE.Group();
      const sealMesh = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 16, 48), darkSealMat);
      sealMesh.castShadow = true;
      sealGroup.add(sealMesh);
      const sealRetainer = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 32), steelMat);
      sealRetainer.rotation.x = Math.PI / 2;
      sealGroup.add(sealRetainer);

      explodableParts.push({
        id: 'shaft_seal',
        itemNo: 1,
        name: 'Rotary Shaft Seal & Viton Wiper',
        group: sealGroup,
        basePos: new THREE.Vector3(0, 0, -1.35),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -1.8),
      });

      // PART 2: Internal Circlip Retaining Ring
      const circlipGroup = new THREE.Group();
      const circlipMesh = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.025, 12, 36, Math.PI * 1.8), darkBoltMat);
      circlipMesh.castShadow = true;
      circlipGroup.add(circlipMesh);

      explodableParts.push({
        id: 'circlip',
        itemNo: 2,
        name: 'Internal Retaining Circlip Ring',
        group: circlipGroup,
        basePos: new THREE.Vector3(0, 0, -1.22),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -1.35),
      });

      // PART 3: Drive Shaft & Front SAE Flange Assembly
      const shaftGroup = new THREE.Group();
      const shaftCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 32), groundShaftMat);
      shaftCylinder.rotation.x = Math.PI / 2;
      shaftCylinder.position.set(0, 0, -0.6);
      shaftCylinder.castShadow = true;
      shaftGroup.add(shaftCylinder);

      const keyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.45), darkBoltMat);
      keyMesh.position.set(0, 0.16, -1.1);
      shaftGroup.add(keyMesh);

      const flangeGroup = new THREE.Group();
      const flangePlate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.15), industrialOrangeMat);
      flangePlate.castShadow = true;
      flangeGroup.add(flangePlate);

      const flangeCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.25, 32), industrialOrangeMat);
      flangeCollar.rotation.x = Math.PI / 2;
      flangeCollar.position.set(0, 0, -0.05);
      flangeCollar.castShadow = true;
      flangeGroup.add(flangeCollar);

      const holeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
      [
        [-0.62, -0.62],
        [0.62, -0.62],
        [-0.62, 0.62],
        [0.62, 0.62],
      ].forEach(([hx, hy]) => {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 16), holeMat);
        hole.rotation.x = Math.PI / 2;
        hole.position.set(hx, hy, 0);
        flangeGroup.add(hole);
      });

      flangeGroup.position.set(0, 0, -0.35);
      shaftGroup.add(flangeGroup);

      const driveFlangeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 32), steelMat);
      driveFlangeDisc.rotation.x = Math.PI / 2;
      driveFlangeDisc.position.set(0, 0, 0.1);
      driveFlangeDisc.castShadow = true;
      shaftGroup.add(driveFlangeDisc);

      explodableParts.push({
        id: 'bearing_flange',
        itemNo: 3,
        name: 'Drive Shaft & Front SAE 4-Bolt Flange',
        group: shaftGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -0.9),
      });

      // PART 4: Bent-Axis 40° Main Casing
      const casingGroup = new THREE.Group();
      const casingNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.7, 32, 1, true), industrialOrangeMat);
      casingNeck.rotation.x = Math.PI / 2;
      casingNeck.position.set(0, 0, 0.1);
      casingNeck.castShadow = true;
      casingGroup.add(casingNeck);

      const casingBody = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.4, 32, 1, true), industrialOrangeMat);
      casingBody.rotation.x = Math.PI / 2 + BENT_RAD;
      casingBody.position.set(0, -sin40 * 0.55, cos40 * 0.55);
      casingBody.castShadow = true;
      casingGroup.add(casingBody);

      const drainBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 16), industrialOrangeMat);
      drainBoss.rotation.z = Math.PI / 2;
      drainBoss.position.set(-0.72, -0.15, 0.4);
      casingGroup.add(drainBoss);

      explodableParts.push({
        id: 'main_housing',
        itemNo: 4,
        name: 'Bent-Axis Main Housing Body (40° Angle)',
        group: casingGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 0),
        isCasing: true,
      });

      // PART 5: 7x Axial Piston Rotating Group & Cylinder Barrel
      const rotatingGroup = new THREE.Group();
      rotatingGroup.rotation.x = BENT_RAD;

      const barrelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.9, 32);
      const barrelMesh = new THREE.Mesh(barrelGeo, bronzeMat);
      barrelMesh.position.set(0, 0.45, 0);
      barrelMesh.castShadow = true;
      rotatingGroup.add(barrelMesh);

      const PISTON_RADIUS = 0.38;
      for (let i = 0; i < 7; i++) {
        const angle = (i * 2 * Math.PI) / 7;
        const px = Math.cos(angle) * PISTON_RADIUS;
        const pz = Math.sin(angle) * PISTON_RADIUS;

        const pistonSub = new THREE.Group();
        pistonSub.position.set(px, 0, pz);

        const ballHead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), steelMat);
        ballHead.position.set(0, -0.18, 0);
        ballHead.castShadow = true;
        pistonSub.add(ballHead);

        const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.65, 20), groundShaftMat);
        rodMesh.position.set(0, 0.2, 0);
        rodMesh.castShadow = true;
        pistonSub.add(rodMesh);

        rotatingGroup.add(pistonSub);
      }

      const springMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 16), steelMat);
      springMesh.position.set(0, 0.45, 0);
      rotatingGroup.add(springMesh);

      explodableParts.push({
        id: 'rotating_group',
        itemNo: 5,
        name: '7x Axial Piston & Cylinder Barrel Group',
        group: rotatingGroup,
        basePos: new THREE.Vector3(0, -sin40 * 0.25, cos40 * 0.25),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: bentDir.clone().multiplyScalar(1.25),
      });

      dynexSpinPartsRef.current.bentAxisBarrel = rotatingGroup;

      // PART 6: Spherical Valve Timing Plate
      const valvePlateGroup = new THREE.Group();
      valvePlateGroup.rotation.x = BENT_RAD;
      const valvePlateMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.08, 32), steelMat);
      valvePlateMesh.castShadow = true;
      valvePlateGroup.add(valvePlateMesh);

      const portSlotMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 });
      const intakePort = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 12, 24, Math.PI * 0.7), portSlotMat);
      intakePort.rotation.x = Math.PI / 2;
      intakePort.position.set(0, 0.045, 0);
      valvePlateGroup.add(intakePort);

      const dischargePort = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 12, 24, Math.PI * 0.7), portSlotMat);
      dischargePort.rotation.x = Math.PI / 2;
      dischargePort.rotation.z = Math.PI;
      dischargePort.position.set(0, 0.045, 0);
      valvePlateGroup.add(dischargePort);

      explodableParts.push({
        id: 'valve_plate',
        itemNo: 6,
        name: 'Spherical Valve Timing Plate (Kidney Ports)',
        group: valvePlateGroup,
        basePos: new THREE.Vector3(0, -sin40 * 0.92, cos40 * 0.92),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: bentDir.clone().multiplyScalar(2.1),
      });

      // PART 7: Rear Port Cover & SAE High-Pressure Block
      const rearBlockGroup = new THREE.Group();
      rearBlockGroup.rotation.x = BENT_RAD;

      const rearBlockMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.74, 0.5, 32), industrialOrangeMat);
      rearBlockMesh.castShadow = true;
      rearBlockGroup.add(rearBlockMesh);

      const portPipeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
      const portA = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 24), portPipeMat);
      portA.position.set(0.3, 0.3, 0);
      rearBlockGroup.add(portA);

      const portB = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.25, 24), portPipeMat);
      portB.position.set(-0.3, 0.3, 0);
      rearBlockGroup.add(portB);

      explodableParts.push({
        id: 'port_cover',
        itemNo: 7,
        name: 'Rear Port Cover & SAE High-Pressure Block',
        group: rearBlockGroup,
        basePos: new THREE.Vector3(0, -sin40 * 1.25, cos40 * 1.25),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: bentDir.clone().multiplyScalar(2.9),
      });

      // PART 8: High-Tensile Assembly Screws (4x M12)
      const boltsGroup = new THREE.Group();
      boltsGroup.rotation.x = BENT_RAD;

      const boltCoords = [
        [-0.45, -0.45],
        [0.45, -0.45],
        [-0.45, 0.45],
        [0.45, 0.45],
      ];

      boltCoords.forEach(([bx, bz]) => {
        const singleBolt = new THREE.Group();
        singleBolt.position.set(bx, 0.4, bz);

        const boltHead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6), darkBoltMat);
        singleBolt.add(boltHead);

        const boltStud = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 16), steelMat);
        boltStud.position.set(0, -0.25, 0);
        singleBolt.add(boltStud);

        boltsGroup.add(singleBolt);
      });

      explodableParts.push({
        id: 'cap_screws',
        itemNo: 8,
        name: 'High-Tensile Housing Screws (4x M12)',
        group: boltsGroup,
        basePos: new THREE.Vector3(0, -sin40 * 1.55, cos40 * 1.55),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: bentDir.clone().multiplyScalar(3.8),
      });
    } else if (isDynex) {
      // --- AUTHENTIC DYNEX CHECKBALL PISTON PUMP (MODEL 2236) 3D DIGITAL TWIN ---
      // Matches the exact Lunchbox Sessions teal model with wobble swashplate cam,
      // bronze slipper holddown ring, hollow checkball plungers, and discharge head.

      const dynexTealMat = new THREE.MeshStandardMaterial({
        color: 0x48a8b8, // Authentic Dynex hammered teal turquoise finish
        metalness: 0.22,
        roughness: 0.32,
      });
      casingMaterialsRef.current.push(dynexTealMat);

      const barrelCastMat = new THREE.MeshStandardMaterial({
        color: 0x334155, // Heavy ductile cast iron barrel
        metalness: 0.8,
        roughness: 0.4,
      });

      // PART 1: External Drive Shaft Snap Ring (Leftmost)
      const snapRingGroup = new THREE.Group();
      const snapRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 12, 32, Math.PI * 1.85), darkBoltMat);
      snapRing.rotation.x = Math.PI / 2;
      snapRing.castShadow = true;
      snapRingGroup.add(snapRing);

      explodableParts.push({
        id: 'shaft_snap_ring',
        itemNo: 1,
        name: 'External Drive Shaft Snap Ring',
        group: snapRingGroup,
        basePos: new THREE.Vector3(0, 0, -2.1),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -2.4),
      });

      // PART 2: Internal Housing Snap Ring (Circlip)
      const housingCirclipGroup = new THREE.Group();
      const housingCirclip = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.03, 14, 40, Math.PI * 1.88), darkBoltMat);
      housingCirclip.rotation.x = Math.PI / 2;
      housingCirclip.castShadow = true;
      housingCirclipGroup.add(housingCirclip);

      explodableParts.push({
        id: 'housing_circlip',
        itemNo: 2,
        name: 'Internal Housing Retaining Circlip',
        group: housingCirclipGroup,
        basePos: new THREE.Vector3(0, 0, -1.8),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -1.9),
      });

      // PART 3: Front Radial Ball Bearing
      const bearingGroup = new THREE.Group();
      const bOuterRace = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.22, 32, 1, true), steelMat);
      bOuterRace.rotation.x = Math.PI / 2;
      bearingGroup.add(bOuterRace);

      const bInnerRace = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 32, 1, true), steelMat);
      bInnerRace.rotation.x = Math.PI / 2;
      bearingGroup.add(bInnerRace);

      for (let b = 0; b < 8; b++) {
        const ballAng = (b * 2 * Math.PI) / 8;
        const bX = Math.cos(ballAng) * 0.375;
        const bY = Math.sin(ballAng) * 0.375;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), chromeMat);
        ball.position.set(bX, bY, 0);
        bearingGroup.add(ball);
      }

      explodableParts.push({
        id: 'front_ball_bearing',
        itemNo: 3,
        name: 'Front Radial Deep-Groove Ball Bearing',
        group: bearingGroup,
        basePos: new THREE.Vector3(0, 0, -1.45),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -1.4),
      });

      // PART 4: Teal Main Pump Housing (with SAE Mounting Flange, DYNEX Badge & Side Inspection Window)
      const casingGroup = new THREE.Group();

      // Front 2-Bolt SAE Mounting Flange
      const mountFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 32), dynexTealMat);
      mountFlange.rotation.x = Math.PI / 2;
      mountFlange.position.set(0, 0, -0.75);
      mountFlange.castShadow = true;
      casingGroup.add(mountFlange);

      // Flange bolt ears
      const earA = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 0.16), dynexTealMat);
      earA.position.set(0, 0, -0.75);
      casingGroup.add(earA);

      // Main cylindrical casing body
      const mainCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 1.25, 32, 1, true), dynexTealMat);
      mainCasing.rotation.x = Math.PI / 2;
      mainCasing.position.set(0, 0, -0.05);
      mainCasing.castShadow = true;
      casingGroup.add(mainCasing);

      // Circular Side Inspection Window with Polished Bevel Trim
      const windowTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 32), steelMat);
      windowTrim.rotation.z = Math.PI / 2;
      windowTrim.position.set(-0.76, 0, -0.05);
      casingGroup.add(windowTrim);

      const windowHole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 32), darkBoltMat);
      windowHole.rotation.z = Math.PI / 2;
      windowHole.position.set(-0.74, 0, -0.05);
      casingGroup.add(windowHole);

      // DYNEX Metal Nameplate on side
      const badgeMat = new THREE.MeshStandardMaterial({
        map: createDynexBadgeTexture(),
        metalness: 0.6,
        roughness: 0.25,
      });
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), badgeMat);
      badge.position.set(0, 0.785, -0.3);
      badge.rotation.x = -Math.PI / 2;
      casingGroup.add(badge);

      explodableParts.push({
        id: 'main_casing',
        itemNo: 4,
        name: 'Teal Casing Body (SAE Flange & DYNEX Badge)',
        group: casingGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -0.7),
        isCasing: true,
      });

      // PART 5: High-Pressure Shaft Seal (Viton Double Lip)
      const sealGroup = new THREE.Group();
      const sealMesh = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 16, 40), darkSealMat);
      sealMesh.rotation.x = Math.PI / 2;
      sealGroup.add(sealMesh);

      explodableParts.push({
        id: 'shaft_seal',
        itemNo: 5,
        name: 'High-Pressure Fluorocarbon Shaft Seal',
        group: sealGroup,
        basePos: new THREE.Vector3(0, 0, -0.45),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -0.2),
      });

      // PART 6: Drive Shaft & 15° Wobble Swashplate Cam
      const camshaftGroup = new THREE.Group();
      // Drive Shaft with Keyway
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.8, 32), groundShaftMat);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(0, 0, -0.5);
      shaft.castShadow = true;
      camshaftGroup.add(shaft);

      const key = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.45), darkBoltMat);
      key.position.set(0, 0.16, -1.05);
      camshaftGroup.add(key);

      // Tapered Roller Thrust Bearing Collar
      const thrustCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 32), steelMat);
      thrustCollar.rotation.x = Math.PI / 2;
      thrustCollar.position.set(0, 0, 0.05);
      thrustCollar.castShadow = true;
      camshaftGroup.add(thrustCollar);

      // Fixed 15° Angled Wobble Cam Swashplate
      const WOBBLE_ANGLE = (15 * Math.PI) / 180;
      const wobbleFaceGroup = new THREE.Group();
      wobbleFaceGroup.position.set(0, 0, 0.22);
      wobbleFaceGroup.rotation.x = WOBBLE_ANGLE;

      const wobblePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 32), chromeMat);
      wobblePlate.rotation.x = Math.PI / 2;
      wobblePlate.castShadow = true;
      wobbleFaceGroup.add(wobblePlate);
      camshaftGroup.add(wobbleFaceGroup);

      explodableParts.push({
        id: 'camshaft_swashplate',
        itemNo: 6,
        name: 'Camshaft & 15° Wobble Swashplate Cam',
        group: camshaftGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 0.3),
      });

      dynexSpinPartsRef.current.camshaft = camshaftGroup;

      // PART 7: Bronze Slipper Holddown Ring & Slipper Shoes
      const holddownGroup = new THREE.Group();
      holddownGroup.rotation.x = (15 * Math.PI) / 180;

      const holddownDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 32), bronzeMat);
      holddownDisc.rotation.x = Math.PI / 2;
      holddownDisc.position.set(0, 0, 0.35);
      holddownDisc.castShadow = true;
      holddownGroup.add(holddownDisc);

      // 5 Golden Bronze Slipper Retainer Shoes
      for (let p = 0; p < 5; p++) {
        const pAng = (p * 2 * Math.PI) / 5;
        const pX = Math.cos(pAng) * 0.4;
        const pY = Math.sin(pAng) * 0.4;
        const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 16), bronzeMat);
        shoe.rotation.x = Math.PI / 2;
        shoe.position.set(pX, pY, 0.35);
        holddownGroup.add(shoe);
      }

      explodableParts.push({
        id: 'holddown_plate',
        itemNo: 7,
        name: 'Bronze Slipper Holddown Ring & Shoes',
        group: holddownGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 0.8),
      });

      dynexSpinPartsRef.current.holddown = holddownGroup;

      // PART 8: 5x Hollow Checkball Piston Plungers & Return Springs
      const pistonsGroup = new THREE.Group();
      const PISTON_RADIUS_DYNEX = 0.4;

      for (let p = 0; p < 5; p++) {
        const pAng = (p * 2 * Math.PI) / 5;
        const pX = Math.cos(pAng) * PISTON_RADIUS_DYNEX;
        const pY = Math.sin(pAng) * PISTON_RADIUS_DYNEX;

        const singlePiston = new THREE.Group();
        singlePiston.position.set(pX, pY, 0.45);

        // Ground Plunger Body
        const plungerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.62, 24), groundShaftMat);
        plungerBody.rotation.x = Math.PI / 2;
        plungerBody.castShadow = true;
        singlePiston.add(plungerBody);

        // Return Compression Coil Spring
        const returnSpring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.45, 16), steelMat);
        returnSpring.rotation.x = Math.PI / 2;
        returnSpring.position.set(0, 0, 0.05);
        singlePiston.add(returnSpring);

        // Internal Inlet Checkball (Seated in hollow plunger)
        const inletBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), chromeMat);
        inletBall.position.set(0, 0, -0.15);
        singlePiston.add(inletBall);

        pistonsGroup.add(singlePiston);
        dynexPistonsList.push({
          group: singlePiston,
          baseZ: 0.45,
          phase: pAng,
        });
      }

      explodableParts.push({
        id: 'checkball_pistons',
        itemNo: 8,
        name: '5x Hollow Checkball Piston Plungers & Springs',
        group: pistonsGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 1.3),
      });

      dynexSpinPartsRef.current.pistons = dynexPistonsList;

      // PART 9: Stationary Cylinder Barrel (with 6 Cap Screws)
      const barrelGroup = new THREE.Group();
      const barrelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.7, 32), barrelCastMat);
      barrelBody.rotation.x = Math.PI / 2;
      barrelBody.position.set(0, 0, 0.85);
      barrelBody.castShadow = true;
      barrelGroup.add(barrelBody);

      // Flange with 6 perimeter socket head cap screws
      const barrelFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.14, 32), dynexTealMat);
      barrelFlange.rotation.x = Math.PI / 2;
      barrelFlange.position.set(0, 0, 1.15);
      barrelGroup.add(barrelFlange);

      for (let s = 0; s < 6; s++) {
        const sAng = (s * 2 * Math.PI) / 6;
        const sX = Math.cos(sAng) * 0.77;
        const sY = Math.sin(sAng) * 0.77;
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 16), darkBoltMat);
        screw.rotation.x = Math.PI / 2;
        screw.position.set(sX, sY, 1.15);
        barrelGroup.add(screw);
      }

      explodableParts.push({
        id: 'stationary_barrel',
        itemNo: 9,
        name: 'Stationary Cylinder Barrel (6 Cap Screws)',
        group: barrelGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 1.8),
      });

      // PART 10: 5x Outlet Discharge Checkballs & Conical Springs
      const dischargeGroup = new THREE.Group();
      for (let p = 0; p < 5; p++) {
        const pAng = (p * 2 * Math.PI) / 5;
        const pX = Math.cos(pAng) * PISTON_RADIUS_DYNEX;
        const pY = Math.sin(pAng) * PISTON_RADIUS_DYNEX;

        const dSub = new THREE.Group();
        dSub.position.set(pX, pY, 1.3);

        const dBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), chromeMat);
        dSub.add(dBall);

        const cSpring = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.2, 16), steelMat);
        cSpring.rotation.x = Math.PI / 2;
        cSpring.position.set(0, 0, 0.12);
        dSub.add(cSpring);

        dischargeGroup.add(dSub);
      }

      explodableParts.push({
        id: 'discharge_check_valves',
        itemNo: 10,
        name: '5x Outlet Discharge Checkballs & Conical Springs',
        group: dischargeGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 2.3),
      });

      // PART 11: Full Flow Discharge Head Cover (10,000 PSI Port & 4 Clamping Bolts)
      const headCoverGroup = new THREE.Group();
      const coverBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.45, 32), dynexTealMat);
      coverBlock.rotation.x = Math.PI / 2;
      coverBlock.position.set(0, 0, 1.65);
      coverBlock.castShadow = true;
      headCoverGroup.add(coverBlock);

      // High-Pressure 10,000 PSI Threaded Outlet Port Boss
      const outletBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.25, 24), steelMat);
      outletBoss.rotation.x = Math.PI / 2;
      outletBoss.position.set(0, 0.25, 1.88);
      headCoverGroup.add(outletBoss);

      const portCavity = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 24), darkBoltMat);
      portCavity.rotation.x = Math.PI / 2;
      portCavity.position.set(0, 0.25, 1.88);
      headCoverGroup.add(portCavity);

      // 4 Heavy Hex Socket Head Clamping Bolts
      [
        [-0.48, -0.48],
        [0.48, -0.48],
        [-0.48, 0.48],
        [0.48, 0.48],
      ].forEach(([bx, by]) => {
        const boltHead = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 6), darkBoltMat);
        boltHead.rotation.x = Math.PI / 2;
        boltHead.position.set(bx, by, 1.95);
        headCoverGroup.add(boltHead);
      });

      explodableParts.push({
        id: 'full_flow_cover',
        itemNo: 11,
        name: 'Full Flow Head Cover (10,000 PSI Port & 4 Bolts)',
        group: headCoverGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 2.8),
      });
    } else {
      // GENERIC HYDRAULIC VALVE 3D MODEL
      const endPlugGroup = new THREE.Group();
      const plugMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 32), steelMat);
      plugMesh.rotation.x = Math.PI / 2;
      endPlugGroup.add(plugMesh);
      explodableParts.push({
        id: 'end_plug',
        itemNo: 1,
        name: 'Retaining End Plug & Seal Carrier',
        group: endPlugGroup,
        basePos: new THREE.Vector3(0, 0, -1.5),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -1.8),
      });

      const springGroup = new THREE.Group();
      const springMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.8, 16), steelMat);
      springMesh.rotation.x = Math.PI / 2;
      springGroup.add(springMesh);
      explodableParts.push({
        id: 'centering_spring',
        itemNo: 2,
        name: 'Bias / Centering Coil Springs',
        group: springGroup,
        basePos: new THREE.Vector3(0, 0, -0.85),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -1.0),
      });

      const spoolGroup = new THREE.Group();
      const spoolCore = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.8, 32), groundShaftMat);
      spoolCore.rotation.x = Math.PI / 2;
      spoolGroup.add(spoolCore);
      [-0.4, 0, 0.4].forEach((sz) => {
        const land = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 32), groundShaftMat);
        land.rotation.x = Math.PI / 2;
        land.position.set(0, 0, sz);
        spoolGroup.add(land);
      });
      explodableParts.push({
        id: 'precision_spool',
        itemNo: 3,
        name: 'Precision-Lapped Metering Spool',
        group: spoolGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, -0.4),
      });

      const sealsGroup = new THREE.Group();
      [-0.55, 0.55].forEach((sz) => {
        const sealRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 16, 32), darkSealMat);
        sealRing.position.set(0, 0, sz);
        sealsGroup.add(sealRing);
      });
      explodableParts.push({
        id: 'seals_pack',
        itemNo: 4,
        name: 'Dynamic O-Rings with PTFE Backup Rings',
        group: sealsGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 0.3),
      });

      const manifoldGroup = new THREE.Group();
      const manifoldMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.6), industrialOrangeMat);
      manifoldMesh.castShadow = true;
      manifoldGroup.add(manifoldMesh);
      explodableParts.push({
        id: 'manifold_body',
        itemNo: 5,
        name: 'Hydraulic Manifold Casing Body',
        group: manifoldGroup,
        basePos: new THREE.Vector3(0, 0, 0),
        baseRot: new THREE.Euler(0, 0, 0),
        explodeDelta: new THREE.Vector3(0, 0, 0),
        isCasing: true,
      });
    }

    // Mount all parts into a parent root group with realistic resting angle
    const modelRoot = new THREE.Group();
    if (isBentAxisPump) {
      modelRoot.rotation.set(-0.25, -2.1, 0.35);
      modelRoot.position.set(0.1, 0.1, 0);
    } else if (isDynex) {
      // Diagonal axial orientation matching Lunchbox Sessions screenshot (front at bottom-left, rear at top-right)
      modelRoot.rotation.set(-0.25, 2.35, -0.2);
      modelRoot.position.set(0, 0, 0);
    }
    scene.add(modelRoot);

    explodableParts.forEach((part) => {
      part.group.position.copy(part.basePos);
      part.group.rotation.copy(part.baseRot);
      modelRoot.add(part.group);
    });

    explodablePartsRef.current = explodableParts;

    // 6. Animation Loop (Smooth Lerp Explode + Working Piston Spin + 2D Screen Label Tracking)
    let animationRunning = true;
    const animate = () => {
      if (!animationRunning) return;
      reqAnimFrameRef.current = requestAnimationFrame(animate);

      // Smooth lerp for explosion progress
      const target = explodeTargetRef.current;
      const current = explodeCurrentRef.current;
      const nextProgress = current + (target - current) * 0.12;
      explodeCurrentRef.current = nextProgress;

      // Update positions of all explodable parts
      explodableParts.forEach((part) => {
        part.group.position.copy(part.basePos).addScaledVector(part.explodeDelta, nextProgress);
      });

      // WORKING MECHANICAL ROTOR & PISTON RECIPROCATING ANIMATION
      if (isSpinningRef.current) {
        spinAngleRef.current += 0.055;
        const ang = spinAngleRef.current;

        // Dynex Checkball Pump rotation
        if (dynexSpinPartsRef.current.camshaft) {
          dynexSpinPartsRef.current.camshaft.rotation.z = ang;
        }
        if (dynexSpinPartsRef.current.holddown) {
          dynexSpinPartsRef.current.holddown.rotation.z = ang;
        }
        if (dynexSpinPartsRef.current.pistons) {
          dynexSpinPartsRef.current.pistons.forEach((p) => {
            // Harmonic sinusoidal stroke driven by wobble plate
            const stroke = Math.sin(ang + p.phase) * 0.14;
            p.group.position.z = p.baseZ + stroke;
          });
        }

        // Bent Axis Pump rotation
        if (dynexSpinPartsRef.current.bentAxisBarrel) {
          dynexSpinPartsRef.current.bentAxisBarrel.rotation.y = ang;
        }
      }

      controls.update();

      // Compute 2D screen positions for 3D part labels
      if (container && camera) {
        const halfWidth = container.clientWidth / 2;
        const halfHeight = container.clientHeight / 2;
        const tempVec = new THREE.Vector3();

        const newLabels = explodableParts.map((part) => {
          part.group.getWorldPosition(tempVec);
          tempVec.project(camera);
          const x = tempVec.x * halfWidth + halfWidth;
          const y = -(tempVec.y * halfHeight) + halfHeight;
          const visible = tempVec.z < 1.0;
          return {
            id: part.id,
            name: part.name,
            itemNo: part.itemNo,
            x,
            y,
            visible,
          };
        });

        setLabelPositions(newLabels);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 7. Handle Resizing
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      animationRunning = false;
      if (reqAnimFrameRef.current) cancelAnimationFrame(reqAnimFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isBentAxisPump, isDynex]);

  // Handle Cutaway Mode Toggle
  useEffect(() => {
    explodablePartsRef.current.forEach((part) => {
      if (part.isCasing) {
        part.group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (isCutaway) {
              child.material.transparent = true;
              child.material.opacity = 0.28;
              child.material.roughness = 0.1;
              child.material.metalness = 0.9;
              child.material.needsUpdate = true;
            } else {
              child.material.transparent = false;
              child.material.opacity = 1.0;
              child.material.roughness = 0.32;
              child.material.metalness = 0.22;
              child.material.needsUpdate = true;
            }
          }
        });
      }
    });
  }, [isCutaway]);

  // Handle Auto Rotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 2.0;
    }
  }, [autoRotate]);

  // Highlight selected part with emissive glow
  useEffect(() => {
    explodablePartsRef.current.forEach((part) => {
      const isSelected = part.itemNo === selectedItemNo;
      part.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (isSelected) {
            child.material.emissive = new THREE.Color(0x0284c7);
            child.material.emissiveIntensity = 0.45;
          } else {
            child.material.emissive = new THREE.Color(0x000000);
            child.material.emissiveIntensity = 0;
          }
        }
      });
    });
  }, [selectedItemNo]);

  return (
    <div className="space-y-6">
      {/* 3D WebGL Exploded Stage Container */}
      <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Stage Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4 sm:px-5 py-3 text-xs gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-bold text-slate-900">
              <Layers className="size-4 text-[#0B57D0]" />
              {isBentAxisPump
                ? 'Bent Axis Piston Pump — Interactive 3D Exploded Twin'
                : isDynex
                ? 'Dynex Checkball Piston Pump — 3D Mechanical Assembly'
                : `${sim.title} — 3D Mechanical Assembly`}
            </span>
            <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              WebGL 3D Active
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium text-[11px] hidden sm:inline">
              Drag to Orbit &bull; Right-Click to Pan &bull; Scroll to Zoom
            </span>
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition-all ${
                autoRotate
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {autoRotate ? 'Stop Rotation' : 'Auto Turntable'}
            </button>
          </div>
        </div>

        {/* The 3D Viewport with Floating Lunchbox HUD */}
        <div className="relative w-full h-[540px] sm:h-[620px] lg:h-[680px] bg-[#fcfdfd] overflow-hidden select-none cursor-grab active:cursor-grabbing">
          {/* Three.js Canvas Mount */}
          <div ref={mountRef} className="absolute inset-0 w-full h-full" />

          {/* Top-Left Instructions (Matching Lunchbox Sessions) */}
          <div className="absolute top-4 left-4 z-20 space-y-1">
            <div className="rounded-xl bg-white/90 px-3.5 py-2.5 text-xs text-slate-800 backdrop-blur-md shadow-md border border-slate-200/80 space-y-0.5">
              <div className="font-bold text-slate-900 text-[11px]">
                Pan: <span className="font-normal text-slate-600">Right Mouse Button / Two-Finger Drag</span>
              </div>
              <div className="font-bold text-slate-900 text-[11px]">
                Labels: <span className="font-normal text-slate-600">Click or Tap Each Part</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2b59c3] px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition-all"
            >
              <Settings className="size-3.5" />
              Settings
            </button>

            {showSettings && (
              <div className="mt-2 rounded-xl bg-slate-900/95 p-3 text-xs text-slate-200 backdrop-blur-md shadow-xl border border-slate-800 space-y-2 w-48">
                <div className="font-bold text-white text-[11px] uppercase tracking-wider border-b border-slate-800 pb-1">
                  Render Options
                </div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Auto-Turntable</span>
                  <input
                    type="checkbox"
                    checked={autoRotate}
                    onChange={(e) => setAutoRotate(e.target.checked)}
                    className="accent-blue-500 rounded"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Show Callout Pins</span>
                  <input
                    type="checkbox"
                    checked={allLabels}
                    onChange={(e) => setAllLabels(e.target.checked)}
                    className="accent-blue-500 rounded"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Gesture Hints</span>
                  <input
                    type="checkbox"
                    checked={showControlsHint}
                    onChange={(e) => setShowControlsHint(e.target.checked)}
                    className="accent-blue-500 rounded"
                  />
                </label>
              </div>
            )}
          </div>

          {/* 3D Floating Part Labels (Projected into 2D Screen Space) */}
          {allLabels && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {labelPositions.map((lbl) => {
                if (!lbl.visible || lbl.x < 20) return null;
                const isSelected = lbl.itemNo === selectedItemNo;
                return (
                  <div
                    key={lbl.id}
                    className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                    style={{ left: `${lbl.x}px`, top: `${lbl.y}px` }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedItemNo(lbl.itemNo)}
                      onMouseEnter={() => setHoveredPartName(lbl.name)}
                      onMouseLeave={() => setHoveredPartName(null)}
                      className={`group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-md transition-all border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-400 scale-110 ring-4 ring-blue-500/20'
                          : 'bg-white/95 text-slate-800 border-slate-300/80 hover:bg-blue-50 hover:border-blue-400'
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${
                          isSelected ? 'bg-white animate-pulse' : 'bg-blue-600'
                        }`}
                      />
                      <span className="whitespace-nowrap">#{lbl.itemNo} {lbl.name.split(' ')[0]}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Left Gesture Controls Helper */}
          {showControlsHint && (
            <div className="absolute bottom-4 left-4 z-20 rounded-xl bg-slate-900/80 px-3.5 py-2 text-[11px] text-slate-200 backdrop-blur-md shadow-lg border border-slate-700/60 hidden sm:flex items-center gap-3">
              <span className="flex items-center gap-1 font-medium">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Rotate: <kbd className="font-mono text-slate-400">Left Drag</kbd>
              </span>
              <span className="text-slate-600">&bull;</span>
              <span className="flex items-center gap-1 font-medium">
                Pan: <kbd className="font-mono text-slate-400">Right Drag</kbd>
              </span>
              <span className="text-slate-600">&bull;</span>
              <span className="flex items-center gap-1 font-medium">
                Zoom: <kbd className="font-mono text-slate-400">Scroll</kbd>
              </span>
            </div>
          )}

          {/* RIGHT FLOATING HUD PANEL (Exact Lunchbox Sessions Layout) */}
          <div className="absolute top-4 right-4 z-20 w-[190px] rounded-2xl bg-[#2b59c3] p-3.5 text-white shadow-2xl border border-blue-400/40 backdrop-blur-sm space-y-2.5">
            {/* Explode View Slider (Hover & Drag interactive) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span>Explode View</span>
                <span className="font-mono text-blue-200 text-[10px] font-bold">{Math.round(explodeValue * 100)}%</span>
              </div>
              <div
                className="relative flex items-center py-1 cursor-ew-resize group"
                title="Hover or drag across to expand/explode the 3D model"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setExplodeValue(Math.round(fraction * 100) / 100);
                }}
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={explodeValue}
                  onChange={(e) => setExplodeValue(parseFloat(e.target.value))}
                  className="w-full h-2 bg-blue-950/70 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>

            {/* Start Spin Button */}
            <button
              type="button"
              onClick={() => setIsSpinning(true)}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-xs font-bold transition-all shadow-sm ${
                isSpinning
                  ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                  : 'bg-white text-[#2b59c3] hover:bg-blue-50'
              }`}
            >
              <Play className="size-3 fill-current" />
              {isSpinning ? 'Spinning Active' : 'Start Spin'}
            </button>

            {/* Stop Spin Button */}
            <button
              type="button"
              onClick={() => setIsSpinning(false)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 px-3 text-xs font-bold text-[#2b59c3] shadow-sm hover:bg-blue-50 active:scale-95 transition-all"
            >
              <Square className="size-3 fill-current" />
              Stop Spin
            </button>

            {/* Reset Button */}
            <button
              type="button"
              onClick={resetCamera}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 px-3 text-xs font-bold text-[#2b59c3] shadow-sm hover:bg-blue-50 active:scale-95 transition-all"
            >
              <RotateCcw className="size-3" />
              Reset
            </button>

            <div className="h-px bg-blue-400/30 my-1" />

            {/* Controls Toggle */}
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span>Controls</span>
              <button
                type="button"
                onClick={() => setShowControlsHint(!showControlsHint)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  showControlsHint ? 'bg-emerald-500' : 'bg-blue-950/60'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    showControlsHint ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* All Labels Toggle */}
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span>All Labels</span>
              <button
                type="button"
                onClick={() => setAllLabels(!allLabels)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  allLabels ? 'bg-emerald-500' : 'bg-blue-950/60'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    allLabels ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Cutaway Toggle */}
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span>Cutaway</span>
              <button
                type="button"
                onClick={() => setIsCutaway(!isCutaway)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  isCutaway ? 'bg-emerald-500' : 'bg-blue-950/60'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isCutaway ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Selected Part Quick Ribbon */}
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Focused Part:</span>
            <span className="font-bold text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-2xs">
              #{selectedItem.itemNo} &mdash; {selectedItem.name}
            </span>
            <span className="font-mono text-slate-500 text-[11px]">({selectedItem.partNumber})</span>
          </div>

          <div className="flex items-center gap-4 text-slate-600 text-[11px]">
            <span><strong>Material:</strong> {selectedItem.material}</span>
            <span><strong>Preload / Torque:</strong> {selectedItem.torqueOrTolerance}</span>
          </div>
        </div>
      </div>

      {/* Industrial Bill of Materials & Overhaul Guide Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Wrench className="size-4 text-[#0B57D0]" />
              Engineering Bill of Materials & Teardown Protocol
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any component row below to highlight its 3D mesh and inspect critical assembly tolerances.
            </p>
          </div>
          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {bomItems.length} Subassemblies Identified
          </span>
        </div>

        {/* Interactive BOM Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200 font-bold">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center">Item</th>
                <th className="py-2.5 px-3">Subassembly Component</th>
                <th className="py-2.5 px-3">Part Number</th>
                <th className="py-2.5 px-3">Material Grade</th>
                <th className="py-2.5 px-3">Qty</th>
                <th className="py-2.5 px-3">Torque / Fit Tolerance</th>
                <th className="py-2.5 px-3">Teardown Inspection Standard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bomItems.map((item) => {
                const isSelected = item.itemNo === selectedItemNo;
                return (
                  <tr
                    key={item.itemNo}
                    onClick={() => setSelectedItemNo(item.itemNo)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/80 font-medium text-blue-900'
                        : 'hover:bg-slate-50/70 text-slate-700'
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center size-6 rounded-full text-xs font-bold ${
                          isSelected
                            ? 'bg-[#0B57D0] text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.itemNo}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold flex items-center gap-2">
                      {isSelected && <CheckCircle2 className="size-3.5 text-blue-600 shrink-0" />}
                      {item.name}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">{item.partNumber}</td>
                    <td className="py-3 px-3 text-slate-600">{item.material}</td>
                    <td className="py-3 px-3 text-center font-bold">{item.qty}</td>
                    <td className="py-3 px-3 text-slate-900 font-mono text-[11px]">
                      {item.torqueOrTolerance}
                    </td>
                    <td className="py-3 px-3 text-slate-600 max-w-xs">{item.inspectionCriteria}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Component Detailed Inspection Card */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
              #{selectedItem.itemNo}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900 text-sm">{selectedItem.name}</h4>
                <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 font-mono text-[11px] font-bold">
                  {selectedItem.partNumber}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                <strong>Quality Assurance Criteria:</strong> {selectedItem.inspectionCriteria}
              </p>
              <div className="pt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                <span>
                  <strong>Material:</strong> {selectedItem.material}
                </span>
                <span>
                  <strong>Assembly Torque / Tolerance:</strong> {selectedItem.torqueOrTolerance}
                </span>
                <span>
                  <strong>Bill of Materials Qty:</strong> {selectedItem.qty} pcs
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
