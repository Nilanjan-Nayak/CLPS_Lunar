"""Parametric lander presets. Figures are approximate public numbers (press kits / mission reports) meant as
editable starting points for a plan — they are model parameters, not authoritative spacecraft data."""
LANDERS = [
    {"id": "generic-clps-100kg", "name": "Generic CLPS-class lander (parametric)", "dryMassKg": 650, "propellantKg": 1200, "payloadKg": 100,
     "thrustN": 4000, "ispS": 315, "minThrottle": 0.2, "power": "solar",
     "solarPanelAreaM2": 2.6, "panelEfficiency": 0.29, "batteryCapacityWh": 1500, "baseLoadW": 210, "payloadLoadW": 90, "nightSurvivalLoadW": 130, "maxDod": 0.80,
     "note": "Parametric class similar to Nova-C / Blue Ghost; edit freely.", "confidence": "parametric"},
    {"id": "nova-c", "name": "Nova-C class (Intuitive Machines)", "dryMassKg": 675, "propellantKg": 1130, "payloadKg": 100,
     "thrustN": 4000, "ispS": 340, "minThrottle": 0.2, "power": "solar",
     "solarPanelAreaM2": 2.8, "panelEfficiency": 0.29, "batteryCapacityWh": 1650, "baseLoadW": 220, "payloadLoadW": 95, "nightSurvivalLoadW": 140, "maxDod": 0.80,
     "note": "≈1,908 kg launch mass, VR900 (≈900 lbf ≈ 4 kN) LOX/methane main engine; Isp not published — ~340 s assumed for a vacuum methalox engine. IM-2: PDI at 13 km, ≈14.5 min before touchdown.", "confidence": "approx"},
    {"id": "blue-ghost", "name": "Blue Ghost class (Firefly) — Mission 1 as flown", "dryMassKg": 469, "propellantKg": 954, "payloadKg": 94,
     "thrustN": 2600, "ispS": 320, "minThrottle": 0.25, "power": "solar",
     "solarPanelAreaM2": 2.5, "panelEfficiency": 0.30, "batteryCapacityWh": 1450, "baseLoadW": 200, "payloadLoadW": 90, "nightSurvivalLoadW": 125, "maxDod": 0.80,
     "note": "Published M1 figures: launch mass 1,517 kg, dry 469 kg, ten NASA payloads ≈94 kg (TO 19D) → ≈954 kg MMH/MON-3; payload capacity 155 kg (NSSDCA) trades against propellant at the same launch mass. LEROS 4-ET main engine (>1 kN, Isp ≈320 s) + 8 Spectre RCS (1.6 kN total) fire together for braking (≈2.6 kN); terminal descent on pulsed RCS. M1: LOI burn 4 min 15 s, DOI ≈T−63 min, 9-min PDI burn 1,700 → 40 m/s from ≈20 km. The budget closes with only ≈10 kg to spare — as tight as the real mission.", "confidence": "approx"},
    {"id": "apollo-lm", "name": "Apollo Lunar Module (descent stage)", "dryMassKg": 6900, "propellantKg": 8200, "payloadKg": 500,
     "thrustN": 45040, "ispS": 311, "minThrottle": 0.10, "power": "battery",
     "solarPanelAreaM2": 0.0, "panelEfficiency": 0.0, "batteryCapacityWh": 70000, "baseLoadW": 1400, "payloadLoadW": 250, "nightSurvivalLoadW": 1100, "maxDod": 0.85,
     "note": "DPS 45 kN throttleable 10–60 % + full; landed mass ≈7.3–8.2 t.", "confidence": "published"},
    {"id": "vikram-class", "name": "Vikram class (ISRO Chandrayaan-3)", "dryMassKg": 900, "propellantKg": 850, "payloadKg": 26,
     "thrustN": 3200, "ispS": 300, "minThrottle": 0.3, "power": "solar",
     "solarPanelAreaM2": 2.4, "panelEfficiency": 0.28, "batteryCapacityWh": 1200, "baseLoadW": 180, "payloadLoadW": 55, "nightSurvivalLoadW": 115, "maxDod": 0.80,
     "note": "4 × 800 N throttleable engines; 1,752 kg lander module incl. rover.", "confidence": "approx"},
]

LAUNCH_VEHICLES = [
    {"id": "falcon-9", "name": "SpaceX Falcon 9", "tliCapacityKg": 3500, "note": "Approx. TLI capacity with booster recovery."},
    {"id": "falcon-heavy", "name": "SpaceX Falcon Heavy", "tliCapacityKg": 16000, "note": "Approx. TLI capacity (expendable)."},
    {"id": "vulcan", "name": "ULA Vulcan Centaur", "tliCapacityKg": 6000, "note": "Approx., configuration-dependent."},
    {"id": "new-glenn", "name": "Blue Origin New Glenn", "tliCapacityKg": 7000, "note": "Approx. public figure."},
    {"id": "lvm3", "name": "ISRO LVM3", "tliCapacityKg": 1800, "note": "Approx. (Chandrayaan-3 used a phasing-orbit profile)."},
]

TRANSFERS = [
    {"id": "direct", "name": "Direct transfer (~4.5 days)", "cruiseDays": 4.5, "vInfKms": 0.85, "extraDeltaVMps": 40, "note": "CLPS-style direct injection with mid-course corrections."},
    {"id": "apollo", "name": "Fast transfer (~3 days, Apollo-like)", "cruiseDays": 3.0, "vInfKms": 1.0, "extraDeltaVMps": 30, "note": "Higher arrival speed → larger LOI burn."},
    {"id": "phasing", "name": "Earth phasing loops + transfer (~30 days)", "cruiseDays": 30.0, "vInfKms": 0.85, "extraDeltaVMps": 120, "note": "Blue Ghost / Chandrayaan style: several Earth-orbit raising burns before TLI."},
    {"id": "carrier-orbit", "name": "Delivered to lunar orbit by a carrier/propulsion module (~5 days)", "cruiseDays": 5.0, "vInfKms": 0.85, "extraDeltaVMps": 0, "carrierDoesLoi": True, "note": "Apollo CSM / Chandrayaan-3 propulsion-module style: the lander only performs DOI + powered descent."},
    {"id": "low-energy", "name": "Low-energy (weak stability boundary, ~100 days)", "cruiseDays": 100.0, "vInfKms": 0.30, "extraDeltaVMps": 60, "note": "Hakuto-R / CAPSTONE style; smallest LOI burn, longest cruise."},
]
