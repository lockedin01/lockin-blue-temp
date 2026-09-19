import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Primary data directories from the Lunchbox Sessions dataset
const RAW_DIR = '/Users/puneeshgulati/.gemini/antigravity-ide/scratch/lunchbox-sessions-extractor/data/raw';
const MOD_DIR = '/Users/puneeshgulati/Desktop/LunchboxSessions-Data/simulations_modular';

// In-memory index of simulation files for instant lookup
let fileIndex: { idMap: Map<string, string>; slugMap: Map<string, string> } | null = null;

function getIndex() {
  if (fileIndex) return fileIndex;

  const idMap = new Map<string, string>();
  const slugMap = new Map<string, string>();

  try {
    if (fs.existsSync(MOD_DIR)) {
      const files = fs.readdirSync(MOD_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const fullPath = path.join(MOD_DIR, file);
        // Extract ID and slug from filename format: "194_a-simple-load-sense-system.json"
        const match = file.match(/^(\d+)(?:_(.*))?\.json$/);
        if (match) {
          const id = match[1];
          idMap.set(id, fullPath);
          if (match[2]) {
            slugMap.set(match[2], fullPath);
            slugMap.set(`${match[2]}-simulation`, fullPath);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error indexing modular simulations:', err);
  }

  fileIndex = { idMap, slugMap };
  return fileIndex;
}

// Primary simulation alias map for promotional/gated preview stubs that map to full working interactive simulations
const SIM_ALIASES: Record<string, string> = {
  '156': '153',
  'mod-156': '153',
  'open-vs-closed-loop-hydraulic-systems-simulation': '153',
  'open-vs-closed-loop-hydraulic-systems': '153',
  'open-or-closed-loop-puzzle': '153',
  'rexroth-a4vg-simulation': '153',
  'rexroth-a4vg': '153',
  'parker-gold-cup-vent-controlled-simulation': '153',
  'parker-gold-cup-vent-controlled': '153',
  'servo-pump-displacement-simulation': '153',
  'servo-pump-displacement': '153',
  'danfoss-series-90-simulation': '153',
  'danfoss-series-90': '153',
  'parallel-system-puzzler-simulation': '81',
  'parallel-series-systems-lesson': '81',
  'strander-positioner-clamp-gate-and-wedge-simulation': '1623',
  'osb-press-high-pressure-source-simulation': '794',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ simId: string }> }
) {
  let { simId } = await params;
  if (SIM_ALIASES[simId]) {
    simId = SIM_ALIASES[simId];
  }

  const index = getIndex();

  // 1. Locate modular JSON
  let modPath = index.idMap.get(simId) || index.slugMap.get(simId);
  if (!modPath && simId.endsWith('-simulation')) {
    modPath = index.slugMap.get(simId.replace(/-simulation$/, ''));
  }

  if (!modPath) {
    // Check aliases one more time
    const cleanId = simId.replace(/^mod-/, '');
    if (SIM_ALIASES[cleanId]) {
      modPath = index.idMap.get(SIM_ALIASES[cleanId]);
    }
  }

  if (!modPath) {
    return new NextResponse('Simulation definition not found', { status: 404 });
  }

  try {
    const simData = JSON.parse(fs.readFileSync(modPath, 'utf8'));
    const provenanceUrl = simData.provenance?.url || '';
    const rawSlug = provenanceUrl ? provenanceUrl.split('/').pop() : '';

    // 2. Locate raw page.html
    let htmlPath = '';
    if (rawSlug) {
      const candidate = path.join(RAW_DIR, rawSlug, 'page.html');
      if (fs.existsSync(candidate)) htmlPath = candidate;
    }

    if (!htmlPath) {
      // Try searching for directory matching simId or slug
      const candidates = [
        simId,
        `${simId}-simulation`,
        path.basename(modPath, '.json').replace(/^\d+_/, ''),
        `${path.basename(modPath, '.json').replace(/^\d+_/, '')}-simulation`,
      ];

      for (const cand of candidates) {
        const p = path.join(RAW_DIR, cand, 'page.html');
        if (fs.existsSync(p)) {
          htmlPath = p;
          break;
        }
      }
    }

    if (!htmlPath || !fs.existsSync(htmlPath)) {
      return new NextResponse('Simulation raw template not found', { status: 404 });
    }

    let rawHtml = fs.readFileSync(htmlPath, 'utf8');

    // If the template contains preview-card and no svg, fallback to 153
    if (rawHtml.includes('id="preview-card"') && !rawHtml.includes('<svg') && !rawHtml.includes('id="svga"')) {
      const fallbackPath = path.join(RAW_DIR, 'closed-hydrostatic-loop-simulation', 'page.html');
      if (fs.existsSync(fallbackPath)) {
        rawHtml = fs.readFileSync(fallbackPath, 'utf8');
      }
    }

    // 3. Strip any paywall preview card completely
    rawHtml = rawHtml.replace(/<section id="preview-card"[\s\S]*?<\/section>/gi, '');

    // 3.5 Strip document.domain assignment which crashes on localhost / non-lunchbox domain
    rawHtml = rawHtml.replace(/document\.domain\s*=\s*["'][^"']*["'];?/g, '');

    // 4. Remove external site wrappers, heartbeat, and 403 CDN scripts from CloudFront
    rawHtml = rawHtml.replace(
      /<script defer src="https:\/\/cdn\.lunchboxsessions\.com\/[^"]*"><\/script>/g,
      ''
    );
    rawHtml = rawHtml.replace(
      /<script[^>]*src="https:\/\/asset\.lunchboxsessions\.com\/assets\/application-[^"]*"[^>]*><\/script>/gi,
      ''
    );
    rawHtml = rawHtml.replace(
      /<script[^>]*src="https:\/\/asset\.lunchboxsessions\.com\/assets\/heartbeat-[^"]*"[^>]*><\/script>/gi,
      ''
    );

    // 5. Ensure <svg id="svga"> has viewBox attribute for responsive scaling to full width/height
    rawHtml = rawHtml.replace(/<svg\b([^>]*id=["']svga["'][^>]*)>/i, (match, attrs) => {
      if (!attrs.includes('viewBox')) {
        const wMatch = attrs.match(/width=["'](\d+)["']/);
        const hMatch = attrs.match(/height=["'](\d+)["']/);
        if (wMatch && hMatch) {
          return `<svg ${attrs} viewBox="0 0 ${wMatch[1]} ${hMatch[1]}" preserveAspectRatio="xMidYMid meet">`;
        }
      }
      return match;
    });

    // 6. Inject script_bundle with global Take and Make bindings & bypassed iframe handshake
    let scriptInjection = '';
    if (simData.script_bundle) {
      const activeBundle = simData.script_bundle.replaceAll(
        'if(window!==window.top)',
        'if(false)'
      );
      scriptInjection = `
      <script>
        window.Take = window.LBSTake;
        window.Make = window.LBSMake;
        window.ready = function(fn) {
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
          } else {
            fn();
          }
        };
        console.log("Starting TakeAndMake Simulation ${simId}...");
        try {
          ${activeBundle}
          console.log("TakeAndMake Simulation ${simId} engine loaded successfully!");
        } catch (err) {
          console.error("Simulation script error:", err);
        }
      </script>
      `;
    }

    // 7. Inject clean standalone simulation layout styles (into <head>)
    const customStyles = `
      <style>
        #header, .header-bg, footer, #footer, .user-nav, .left.half, .right.half, .buttons, #popover, .popover, #preview-card, .box-light, .box-small, [href="/join"], [href="/login"] {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
          z-index: -9999 !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          background: #cfd4dc !important;
          overflow: hidden !important;
        }
        .materials, .artifact, #show, #page {
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          height: 100% !important;
          background: #cfd4dc !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        #svga {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          display: block !important;
          margin: auto !important;
        }
        [data-action], [data-control], [data-slider], .interactive, svg [cursor="pointer"] {
          cursor: pointer !important;
        }
      </style>
    `;

    // 8. Universal Fluid Dynamics, Mechanics & Rotary Physics Engine (injected before </body>)
    const universalEngineScript = `
      <script>
        // Simulation Control & Physics Flow Bridge
        window.__isSimPaused = false;
        window.__simSpeed = 1.0;
        window.__flowMultiplier = 1.0;
        window.__fluidEngineBooted = false;

        // Parent postMessage communication for live Play/Stop/Speed/Direction controls
        window.addEventListener("message", function(e) {
          if (!e.data || typeof e.data !== "object") return;
          var msg = e.data;
          if (msg.action === "play") {
            window.__isSimPaused = false;
          } else if (msg.action === "stop" || msg.action === "pause") {
            window.__isSimPaused = true;
          } else if (msg.action === "setSpeed") {
            window.__simSpeed = Math.max(0.1, Math.min(5.0, Number(msg.speed) || 1.0));
          } else if (msg.action === "setFlowState") {
            if (msg.state === "reverse") {
              window.__flowMultiplier = -1.0;
            } else if (msg.state === "neutral") {
              window.__flowMultiplier = 0.0;
            } else {
              window.__flowMultiplier = 1.0;
            }
          }
        });

        // Intercept requestAnimationFrame to allow Play/Pause/Stop
        var _origRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = function(cb) {
          return _origRAF(function(time) {
            if (window.__isSimPaused) {
              _origRAF(window.requestAnimationFrame.bind(null, cb));
            } else {
              cb(time);
            }
          });
        };

        // Suppress legacy popover warning
        function cleanPopovers() {
          var p = document.getElementById("popover");
          if (p) p.remove();
        }
        window.__popoverObserver = new MutationObserver(cleanPopovers);
        window.__popoverObserver.observe(document.documentElement, { childList: true, subtree: true });

        // Universal Fluid Dynamic & Mechanical Animation Engine
        var arrowNodes = [];
        var rotatingNodes = [];
        var cylinderPiston = null;
        var interactiveBound = false;

        function scanElements() {
          cleanPopovers();

          if (arrowNodes.length === 0) {
            var markerGroups = document.querySelectorAll('[id*="markerBox"]');
            markerGroups.forEach(function(el) {
              if (el.closest("defs") || el.id === "markerBox_0_L1_0_F") return;
              var tf = el.getAttribute("transform") || "";
              if (tf.indexOf("matrix(") !== -1) {
                var inner = tf.substring(tf.indexOf("matrix(") + 7, tf.indexOf(")"));
                var vals = inner.replace(/,/g, " ").trim().split(" ").filter(Boolean).map(Number);
                if (vals.length === 6) {
                  var a = vals[0], b = vals[1], c = vals[2], d = vals[3], tx = vals[4], ty = vals[5];
                  var dirX = a, dirY = b;
                  var len = Math.sqrt(dirX * dirX + dirY * dirY);
                  if (len > 0.001) {
                    dirX /= len;
                    dirY /= len;
                  } else {
                    dirX = 0; dirY = 1;
                  }
                  arrowNodes.push({
                    el: el,
                    a: a, b: b, c: c, d: d,
                    origTx: tx,
                    origTy: ty,
                    dirX: dirX,
                    dirY: dirY,
                    range: 60
                  });
                }
              }
            });
            window.__arrowNodes = arrowNodes;
          }

          if (rotatingNodes.length === 0) {
            var rotateEls = document.querySelectorAll('#leftGear, #rightGear, [id*="leftGear"], [id*="rightGear"], #rotatingGroup, #spinner, [id*="Spinner"], [id*="spinner"], [id*="rotor"], [id*="Rotor"], [id*="Pump_0"], [id*="Pump2_0"], [id*="pump_0"], [id*="pump2_0"], [id*="motor_0"], [id*="Motor_0"], [id*="rotating"], [id*="impeller"], [id*="Impeller"], [id*="pinion"], [id*="Pinion"], [id*="sprocket"], [id*="Sprocket"]');
            rotateEls.forEach(function(el) {
              if (el.closest("defs")) return;
              if (el.parentElement && el.parentElement.closest('#leftGear, #rightGear, [id*="leftGear"], [id*="rightGear"], #rotatingGroup, [id*="rotor"], [id*="Rotor"]')) return;
              
              var initialTf = el.getAttribute("transform") || "";
              
              var mTx = 0, mTy = 0;
              var a = 1, b = 0, c = 0, d = 1;
              if (initialTf.indexOf("matrix(") !== -1) {
                var innerTf = initialTf.substring(initialTf.indexOf("matrix(") + 7, initialTf.indexOf(")"));
                var tfVals = innerTf.replace(/,/g, " ").trim().split(" ").filter(Boolean).map(Number);
                if (tfVals.length === 6) {
                  a = tfVals[0]; b = tfVals[1]; c = tfVals[2]; d = tfVals[3];
                  mTx = tfVals[4]; mTy = tfVals[5];
                }
              }

              var isRotor = el.id === "rotatingGroup" || el.id.toLowerCase().indexOf("rotor") !== -1;
              var isOppositeGear = el.id === "rightGear" || el.id.toLowerCase().indexOf("rightgear") !== -1 || el.id.indexOf("gear2") !== -1;
              var speed = isOppositeGear ? -120 : (isRotor ? 90 : 120);

              rotatingNodes.push({
                el: el,
                a: a, b: b, c: c, d: d,
                mTx: mTx,
                mTy: mTy,
                isRotor: isRotor,
                speed: speed
              });
            });
            window.__rotatingNodes = rotatingNodes;
          }

          if (!cylinderPiston) {
            var rodEl = document.querySelector("#rod") || document.querySelector("#cylinderRod");
            if (!rodEl) {
              var candRods = document.querySelectorAll('[id*="rod"], [id*="Rod"]');
              for (var r = 0; r < candRods.length; r++) {
                if (!candRods[r].closest("defs")) {
                  rodEl = candRods[r];
                  break;
                }
              }
            }
            var springMountEl = document.querySelector("#springMount");
            if (rodEl && !rodEl.closest("defs")) {
              cylinderPiston = {
                rod: rodEl,
                springMount: springMountEl,
                parentIsRotated: rodEl.parentElement && rodEl.parentElement.id === "cylinder",
                maxStroke: 55
              };
            }
          }

          if (!interactiveBound) {
            var interactiveComponents = document.querySelectorAll('g[id*="Valve"], g[id*="valve"], g[id*="Pump"], g[id*="pump"], g[id*="Cylinder"], g[id*="cylinder"], g[id*="lever"], g[id*="control"]');
            if (interactiveComponents.length > 0) {
              interactiveBound = true;
              interactiveComponents.forEach(function(comp) {
                if (comp.closest("defs")) return;
                comp.style.cursor = "pointer";
                comp.addEventListener("click", function(e) {
                  e.stopPropagation();
                  if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                      action: "componentSelected",
                      id: comp.id,
                      tagName: comp.tagName
                    }, "*");
                  }
                });
              });
            }
          }
        }

        // 5. Continuous 60 FPS Fluid Dynamic & Mechanics Physics Loop
        var lastTime = performance.now();
        var accumulatedDistance = 0;
        var accumulatedAngle = 0;
        window.__fluidFrames = 0;
        window.__fluidError = null;

        function runFluidEngine(currentTime) {
          _origRAF(runFluidEngine);
          window.__fluidFrames++;

          // Scan elements on initial load or dynamic DOM changes
          if (arrowNodes.length === 0 && rotatingNodes.length === 0 && !cylinderPiston) {
            scanElements();
          }

          try {
            if (window.__isSimPaused) {
              lastTime = currentTime;
              return;
            }

            var dt = Math.min((currentTime - lastTime) / 1000, 0.1);
            lastTime = currentTime;
            var speedMultiplier = window.__simSpeed || 1.0;
            var flowMult = window.__flowMultiplier !== undefined ? window.__flowMultiplier : 1.0;
            
            accumulatedDistance += dt * 50 * speedMultiplier * flowMult;
            accumulatedAngle += dt * speedMultiplier * flowMult;

            // Animate Fluid Flow Arrows
            for (var i = 0; i < arrowNodes.length; i++) {
              var node = arrowNodes[i];
              var rawOffset = (accumulatedDistance % node.range);
              if (rawOffset < 0) rawOffset += node.range;
              var curTx = node.origTx + node.dirX * rawOffset;
              var curTy = node.origTy + node.dirY * rawOffset;
              node.el.setAttribute("transform", "matrix(" + node.a + " " + node.b + " " + node.c + " " + node.d + " " + curTx.toFixed(2) + " " + curTy.toFixed(2) + ")");
            }

            // Animate Rotating Pump / Motor Spinners and Meshing Gears
            for (var j = 0; j < rotatingNodes.length; j++) {
              var rNode = rotatingNodes[j];
              var deg = (accumulatedAngle * rNode.speed) % 360;
              var rad = (deg * Math.PI) / 180;
              var cos = Math.cos(rad);
              var sin = Math.sin(rad);
              var nA = rNode.a * cos + rNode.c * sin;
              var nB = rNode.b * cos + rNode.d * sin;
              var nC = -rNode.a * sin + rNode.c * cos;
              var nD = -rNode.b * sin + rNode.d * cos;
              rNode.el.setAttribute("transform", "matrix(" + nA.toFixed(4) + " " + nB.toFixed(4) + " " + nC.toFixed(4) + " " + nD.toFixed(4) + " " + rNode.mTx.toFixed(2) + " " + rNode.mTy.toFixed(2) + ")");
            }

            // Animate Cylinders extending against mechanical springs
            if (cylinderPiston) {
              var strokeCycle = (accumulatedAngle * 1.2) % (Math.PI * 2);
              var strokeVal = ((Math.sin(strokeCycle - Math.PI / 2) + 1) / 2) * cylinderPiston.maxStroke;
              if (cylinderPiston.parentIsRotated) {
                cylinderPiston.rod.setAttribute("transform", "matrix(1 0 0 1 0 " + (-strokeVal).toFixed(2) + ")");
              } else {
                cylinderPiston.rod.setAttribute("transform", "matrix(1 0 0 1 " + strokeVal.toFixed(2) + " 0)");
              }
              if (cylinderPiston.springMount) {
                cylinderPiston.springMount.setAttribute("transform", "matrix(1 0 0 1 " + (752.8 - strokeVal).toFixed(2) + " 111.5)");
              }
            }
          } catch (err) {
            window.__fluidError = String(err && err.stack ? err.stack : err);
            console.error("Simulation animation error:", err);
          }
        }

        scanElements();
        _origRAF(runFluidEngine);
      </script>
    `;

    // Put custom styles in <head> and scripts before </body>
    if (rawHtml.includes('</head>')) {
      rawHtml = rawHtml.replace('</head>', `${customStyles}</head>`);
    } else {
      rawHtml = `${customStyles}${rawHtml}`;
    }

    const allScripts = `${scriptInjection}\n${universalEngineScript}`;
    if (rawHtml.includes('</body>')) {
      rawHtml = rawHtml.replace('</body>', `${allScripts}</body>`);
    } else {
      rawHtml = `${rawHtml}${allScripts}`;
    }

    return new NextResponse(rawHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (error) {
    console.error('Error rendering simulation player:', error);
    return new NextResponse('Failed to initialize simulation player', { status: 500 });
  }
}
