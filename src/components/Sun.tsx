import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Cryogenic (blue) color palette
const C = {
  cHot:  'vec3(0.88, 0.97, 1.00)',
  cMid:  'vec3(0.28, 0.68, 1.00)',
  cCool: 'vec3(0.08, 0.38, 0.88)',
  cDark: 'vec3(0.02, 0.10, 0.38)',
  cFlame: 'vec3(0.78, 0.93, 1.00)',
  cEdge:  'vec3(0.22, 0.58, 1.00)',
  cBirth: 'vec3(0.85, 0.97, 1.00)',
  cDeath: 'vec3(0.05, 0.22, 0.78)',
  halo1A: 'rgba(100,200,255,A)',  halo1B: 'rgba(30,120,255,A)',
  halo2A: 'rgba(50,155,255,A)',   halo2B: 'rgba(10,80,240,A)',
  halo3A: 'rgba(160,215,255,A)', halo3B: 'rgba(80,155,255,A)',
}

const CFG = {
  RADIUS: 48,
  CORE_SEGMENTS: 192,
  SHELL_SEGMENTS: 128,
  FOV: 40,
  CAMERA_DISTANCE: 420,
  CAMERA_DRIFT_X: 12,
  CAMERA_DRIFT_Y: 8,
  CAMERA_DRIFT_SPEED: 0.04,
  CORE_ROT_Y: 0.0006,
  CORE_ROT_X: 0.00008,
  SHELL_ROT_Y: 0.0009,
  SHELL_ROT_X: 0.00012,
  CELL_FREQ_A: 0.018, CELL_FREQ_B: 0.025, CELL_FREQ_C: 0.012, CELL_SPEED: 0.06,
  GRANULE_FREQ_A: 0.08, GRANULE_FREQ_B: 0.15, GRANULE_SPEED: 0.25,
  CONVECT_AMPLITUDE: 4.0, COLUMN_AMPLITUDE: 5.0,
  ACTIVITY_ZONE_COUNT: 3,
  ACTIVITY_ZONE_SPREAD: 2.5,
  ACTIVITY_DRIFT_SPEED: 0.02,
  ACTIVITY_FLUX_SPEED: 0.06,
  ACTIVITY_FLUX_DEPTH: 0.5,
  ACTIVITY_BASE: 0.35,
  SHELL_RADIUS_MULT: 1.06,
  SHELL_TURB_FREQ_A: 0.055, SHELL_TURB_FREQ_B: 0.095, SHELL_TURB_SPEED: 0.14,
  SHELL_TEAR_THRESH: -0.1, SHELL_TEAR_SHARP: 0.5, SHELL_LIFT: 7.0,
  FLAME_COUNT: 800,
  FLAME_SPEED_MIN: 12, FLAME_SPEED_MAX: 32, FLAME_JITTER: 0.35,
  FLAME_LIFE_MIN: 0.3, FLAME_LIFE_MAX: 1.4,
  FLAME_SIZE_MIN: 2.0, FLAME_SIZE_MAX: 8.0, FLAME_CURL: 0.8, FLAME_DECAY: 1.5,
  FLAME_ACTIVITY_SPEED_BOOST: 14, FLAME_ACTIVITY_SIZE_BOOST: 10,
  HALO_BREATHE_SPEED: 0.7, HALO_BREATHE_DEPTH: 0.12,
  HALO1_OPACITY: 0.85, HALO2_OPACITY: 0.55, HALO3_OPACITY: 0.30,
  STAR_COUNT: 2000, STAR_SIZE: 2, STAR_OPACITY: 0.55,
}

const GLSL_NOISE = /* glsl */`
  vec3 _mod289v3(vec3 x){ return x-floor(x*(1./289.))*289.; }
  vec4 _mod289v4(vec4 x){ return x-floor(x*(1./289.))*289.; }
  vec4 _permute(vec4 x){ return _mod289v4(((x*34.)+1.)*x); }
  vec4 _taylorInvSqrt(vec4 r){ return 1.79284291400159-.85373472095314*r; }
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);
    const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=_mod289v3(i);
    vec4 p=_permute(_permute(_permute(
      i.z+vec4(0.,i1.z,i2.z,1.))
      +i.y+vec4(0.,i1.y,i2.y,1.))
      +i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=0.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;
    vec4 s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=_taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`

interface ActivityZone {
  phi: number; theta: number; phaseOffset: number; driftPhi: number; driftTheta: number
}

function mkZones(n: number): ActivityZone[] {
  return Array.from({ length: n }, (_, i) => ({
    phi: Math.acos(2 * Math.random() - 1),
    theta: Math.random() * Math.PI * 2,
    phaseOffset: (i / n) * Math.PI * 2,
    driftPhi: (Math.random() - 0.5) * 0.02,
    driftTheta: (Math.random() - 0.5) * 0.04,
  }))
}

function zonePos(z: ActivityZone): [number, number, number] {
  return [Math.sin(z.phi) * Math.cos(z.theta), Math.sin(z.phi) * Math.sin(z.theta), Math.cos(z.phi)]
}

function zoneEnergy(z: ActivityZone, t: number): number {
  const raw = Math.sin(t * CFG.ACTIVITY_FLUX_SPEED + z.phaseOffset)
  return CFG.ACTIVITY_BASE + raw * CFG.ACTIVITY_FLUX_DEPTH * (1 - CFG.ACTIVITY_BASE)
}

function localActivity(nx: number, ny: number, nz: number, zones: ActivityZone[], t: number): number {
  let total = 0
  for (const z of zones) {
    const [zx, zy, zz] = zonePos(z)
    const prox = (nx*zx + ny*zy + nz*zz + 1) * 0.5
    total += Math.pow(prox, CFG.ACTIVITY_ZONE_SPREAD) * zoneEnergy(z, t)
  }
  return Math.min(1, total)
}

export function Sun() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let destroyed = false
    let rafId = 0
    const R = CFG.RADIUS

    const starRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    starRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    starRenderer.setClearColor(0x000000, 0)
    Object.assign(starRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' })
    mount.appendChild(starRenderer.domElement)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    Object.assign(renderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' })
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(CFG.FOV, 1, 0.1, 8000)
    camera.position.set(0, 0, CFG.CAMERA_DISTANCE)

    const setSize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      renderer.setSize(w, h); starRenderer.setSize(w, h)
      camera.aspect = w / h; camera.updateProjectionMatrix()
    }
    setSize()
    const ro = new ResizeObserver(setSize)
    ro.observe(mount)

    const zones = mkZones(CFG.ACTIVITY_ZONE_COUNT)

    // Core
    const coreGeo = new THREE.SphereGeometry(R, CFG.CORE_SEGMENTS, CFG.CORE_SEGMENTS)
    const coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uZonePos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
        uZoneEnergy: { value: new Float32Array(8) },
        uZoneCount: { value: CFG.ACTIVITY_ZONE_COUNT },
        uZoneSpread: { value: CFG.ACTIVITY_ZONE_SPREAD },
        uActivityBase: { value: CFG.ACTIVITY_BASE },
        uCellFreqA: { value: CFG.CELL_FREQ_A }, uCellFreqB: { value: CFG.CELL_FREQ_B },
        uCellFreqC: { value: CFG.CELL_FREQ_C }, uCellSpeed: { value: CFG.CELL_SPEED },
        uGranFreqA: { value: CFG.GRANULE_FREQ_A }, uGranFreqB: { value: CFG.GRANULE_FREQ_B },
        uGranSpeed: { value: CFG.GRANULE_SPEED },
        uConvectAmp: { value: CFG.CONVECT_AMPLITUDE }, uColumnAmp: { value: CFG.COLUMN_AMPLITUDE },
      },
      vertexShader: /* glsl */`
        ${GLSL_NOISE}
        uniform float uTime;
        uniform vec3  uZonePos[8]; uniform float uZoneEnergy[8];
        uniform int   uZoneCount;  uniform float uZoneSpread, uActivityBase;
        uniform float uCellFreqA,uCellFreqB,uCellFreqC,uCellSpeed;
        uniform float uGranFreqA,uGranFreqB,uGranSpeed,uConvectAmp,uColumnAmp;
        varying vec3 vN,vPos; varying float vHeat,vConvect,vActivity;
        float lact(vec3 n){
          float t=0.;
          for(int i=0;i<8;i++){
            if(i>=uZoneCount)break;
            float d=dot(n,uZonePos[i]);
            t+=pow(max(0.,(d+1.)*.5),uZoneSpread)*uZoneEnergy[i];
          }
          return min(1.,t);
        }
        void main(){
          vN=normalize(normalMatrix*normal); vPos=position;
          float act=lact(normalize(position)); vActivity=act;
          float T=uTime;
          float cell1=snoise(position*uCellFreqA+vec3(T*uCellSpeed*1.2,T*uCellSpeed*.7,T*uCellSpeed*.9));
          float cell2=snoise(position*uCellFreqB+vec3(T*uCellSpeed*.8,T*uCellSpeed*1.5,T*uCellSpeed));
          float cell3=snoise(position*uCellFreqC+vec3(T*uCellSpeed*.5,T*uCellSpeed,T*uCellSpeed*1.3));
          float cells=(cell1+cell2*.6+cell3*.4)/2.;
          float R2=${R.toFixed(1)};
          float col1=exp(-pow(length(position.xz/(R2*.75)-vec2(sin(T*.12),cos(T*.09))*.7),2.)*3.);
          float col2=exp(-pow(length(position.xz/(R2*.75)-vec2(sin(T*.10+2.1),cos(T*.13+1.))*.7),2.)*3.);
          float col3=exp(-pow(length(position.xz/(R2*.75)-vec2(sin(T*.08+4.2),cos(T*.11+2.))*.7),2.)*3.);
          float col4=exp(-pow(length(position.xz/(R2*.75)-vec2(sin(T*.14+1.5),cos(T*.07+3.1))*.7),2.)*3.);
          float hotColumns=col1+col2+col3+col4;
          float gran=snoise(position*uGranFreqA+vec3(T*uGranSpeed*.88,T*uGranSpeed*.72,T*uGranSpeed*.8))*.4;
          gran+=snoise(position*uGranFreqB+vec3(T*uGranSpeed*1.24,T*uGranSpeed*1.08,T*uGranSpeed*1.16))*.2;
          float actScale=mix(.4,1.,act);
          float combined=(cells+gran*.5+hotColumns*.6)*actScale;
          vConvect=hotColumns*actScale;
          vHeat=clamp(combined*.5+.5,0.,1.);
          float amp=uConvectAmp*actScale+hotColumns*uColumnAmp*actScale;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*combined*amp,1.);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vN,vPos; varying float vHeat,vConvect,vActivity;
        void main(){
          vec3 cHot=${C.cHot},cMid=${C.cMid},cCool=${C.cCool},cDark=${C.cDark};
          vec3 viewDir=normalize(cameraPosition-vPos);
          float limb=pow(max(0.,dot(normalize(vN),viewDir)),.6);
          vec3 col=mix(cDark,cCool,smoothstep(0.,.4,vHeat));
          col=mix(col,cMid,smoothstep(.35,.7,vHeat));
          col=mix(col,cHot,smoothstep(.65,1.,vHeat));
          col=mix(col,cHot,clamp(vConvect*.5,0.,1.));
          col=mix(cDark*1.2,col,mix(.6,1.,vActivity));
          col*=mix(.45,1.,limb);
          gl_FragColor=vec4(col*(0.95+0.05*sin(uTime*1.8)),1.);
        }
      `,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    scene.add(core)

    // Shell
    const shellGeo = new THREE.SphereGeometry(R * CFG.SHELL_RADIUS_MULT, CFG.SHELL_SEGMENTS, CFG.SHELL_SEGMENTS)
    const shellMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uZonePos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
        uZoneEnergy: { value: new Float32Array(8) },
        uZoneCount: { value: CFG.ACTIVITY_ZONE_COUNT }, uZoneSpread: { value: CFG.ACTIVITY_ZONE_SPREAD },
        uTurbFreqA: { value: CFG.SHELL_TURB_FREQ_A }, uTurbFreqB: { value: CFG.SHELL_TURB_FREQ_B },
        uTurbSpeed: { value: CFG.SHELL_TURB_SPEED }, uTearThresh: { value: CFG.SHELL_TEAR_THRESH },
        uTearSharp: { value: CFG.SHELL_TEAR_SHARP }, uLift: { value: CFG.SHELL_LIFT },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        ${GLSL_NOISE}
        uniform float uTime;
        uniform vec3 uZonePos[8]; uniform float uZoneEnergy[8];
        uniform int uZoneCount; uniform float uZoneSpread;
        uniform float uTurbFreqA,uTurbFreqB,uTurbSpeed,uTearThresh,uTearSharp,uLift;
        varying vec3 vN,vPos; varying float vAlpha,vActivity;
        float lact(vec3 n){
          float t=0.;
          for(int i=0;i<8;i++){
            if(i>=uZoneCount)break;
            float d=dot(n,uZonePos[i]);
            t+=pow(max(0.,(d+1.)*.5),uZoneSpread)*uZoneEnergy[i];
          }
          return min(1.,t);
        }
        void main(){
          vN=normalize(normalMatrix*normal); vPos=position;
          float act=lact(normalize(position)); vActivity=act;
          float T=uTime;
          float t1=snoise(position*uTurbFreqA+vec3(T*uTurbSpeed*.88,T*uTurbSpeed*.66,T*uTurbSpeed*.72));
          float t2=snoise(position*uTurbFreqB+vec3(T*uTurbSpeed*1.28,T*uTurbSpeed*1.08,T*uTurbSpeed*1.18));
          float tear=t1+t2*.5;
          float actFactor=mix(.3,1.6,act);
          float clamped=clamp(tear*actFactor,-1.,1.);
          vAlpha=smoothstep(uTearThresh,uTearSharp,clamped);
          float lift=max(0.,clamped)*uLift*mix(.4,1.,act);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*lift,1.);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vN,vPos; varying float vAlpha,vActivity;
        void main(){
          vec3 viewDir=normalize(cameraPosition-vPos);
          float rim=1.-max(0.,dot(normalize(vN),viewDir));
          vec3 col=mix(${C.cFlame},${C.cEdge},pow(rim,1.5));
          float a=vAlpha*(.3+rim*.5)*(0.7+0.3*sin(uTime*2.4+vPos.x*.05))*mix(.3,1.,vActivity);
          gl_FragColor=vec4(col,a);
        }
      `,
    })
    const shell = new THREE.Mesh(shellGeo, shellMat)
    scene.add(shell)

    // Flames
    const FC = CFG.FLAME_COUNT
    const fPos = new Float32Array(FC * 3)
    const fVel = new Float32Array(FC * 3)
    const fLife = new Float32Array(FC)
    const fMaxLife = new Float32Array(FC)
    const fSizes = new Float32Array(FC)

    const spawnFlame = (i: number, t: number) => {
      const phi = Math.acos(2 * Math.random() - 1)
      const theta = Math.random() * Math.PI * 2
      const nx = Math.sin(phi)*Math.cos(theta), ny = Math.sin(phi)*Math.sin(theta), nz = Math.cos(phi)
      const act = localActivity(nx, ny, nz, zones, t)
      fPos[i*3]=nx*(R*1.02); fPos[i*3+1]=ny*(R*1.02); fPos[i*3+2]=nz*(R*1.02)
      const speed = CFG.FLAME_SPEED_MIN + Math.random()*(CFG.FLAME_SPEED_MAX-CFG.FLAME_SPEED_MIN) + act*CFG.FLAME_ACTIVITY_SPEED_BOOST
      const j = CFG.FLAME_JITTER
      fVel[i*3]=nx*speed+(Math.random()-.5)*j*speed
      fVel[i*3+1]=ny*speed+(Math.random()-.5)*j*speed
      fVel[i*3+2]=nz*speed+(Math.random()-.5)*j*speed
      fMaxLife[i]=CFG.FLAME_LIFE_MIN+Math.random()*(CFG.FLAME_LIFE_MAX-CFG.FLAME_LIFE_MIN)
      fLife[i]=0
      fSizes[i]=CFG.FLAME_SIZE_MIN+Math.random()*(CFG.FLAME_SIZE_MAX-CFG.FLAME_SIZE_MIN)+act*CFG.FLAME_ACTIVITY_SIZE_BOOST
    }
    for (let i=0;i<FC;i++){spawnFlame(i,0);fLife[i]=Math.random()*fMaxLife[i]}

    const flameGeo = new THREE.BufferGeometry()
    flameGeo.setAttribute('position', new THREE.BufferAttribute(fPos.slice(),3))
    flameGeo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(FC),1))
    flameGeo.setAttribute('aSize', new THREE.BufferAttribute(fSizes,1))

    const flameMat = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      vertexShader:/* glsl */`
        attribute float aLife,aSize; varying float vLife;
        void main(){
          vLife=aLife;
          vec4 mvPos=modelViewMatrix*vec4(position,1.);
          gl_PointSize=aSize*sin(aLife*3.14159)*(300./-mvPos.z);
          gl_Position=projectionMatrix*mvPos;
        }
      `,
      fragmentShader:/* glsl */`
        varying float vLife;
        void main(){
          vec2 uv=gl_PointCoord-.5;
          if(length(uv)>.5)discard;
          float alpha=smoothstep(.5,0.,length(uv));
          vec3 col=mix(${C.cDeath},${C.cBirth},vLife);
          gl_FragColor=vec4(col,alpha*sin(vLife*3.14159)*.85);
        }
      `,
    })
    const flames = new THREE.Points(flameGeo, flameMat)
    scene.add(flames)

    // Halos
    const makeHalo = (innerR:number,outerR:number,baseA:number,cA:string,cB:string)=>{
      const cv=document.createElement('canvas'); cv.width=512; cv.height=512
      const ctx=cv.getContext('2d')!
      const g=ctx.createRadialGradient(256,256,(innerR/outerR)*256,256,256,256)
      g.addColorStop(0,cA.replace('A',baseA.toFixed(2)))
      g.addColorStop(.5,cB.replace('A',(baseA*.2).toFixed(2)))
      g.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle=g; ctx.fillRect(0,0,512,512)
      const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}))
      s.scale.set(outerR*2,outerR*2,1)
      return s
    }
    const halo1=makeHalo(R,R*1.6,CFG.HALO1_OPACITY,C.halo1A,C.halo1B)
    const halo2=makeHalo(R*1.5,R*3.2,CFG.HALO2_OPACITY,C.halo2A,C.halo2B)
    const halo3=makeHalo(R*2.5,R*5.5,CFG.HALO3_OPACITY,C.halo3A,C.halo3B)
    scene.add(halo1); scene.add(halo2); scene.add(halo3)

    // Starfield
    const starScene = new THREE.Scene()
    const starPos = new Float32Array(CFG.STAR_COUNT*3)
    for(let i=0;i<CFG.STAR_COUNT;i++){
      const sr=1500+Math.random()*2000,sp=Math.acos(2*Math.random()-1),st=Math.random()*Math.PI*2
      starPos[i*3]=sr*Math.sin(sp)*Math.cos(st); starPos[i*3+1]=sr*Math.sin(sp)*Math.sin(st); starPos[i*3+2]=sr*Math.cos(sp)
    }
    const starGeo=new THREE.BufferGeometry()
    starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3))
    starScene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:CFG.STAR_SIZE,sizeAttenuation:true,transparent:true,opacity:CFG.STAR_OPACITY})))

    const clock = new THREE.Clock()
    let T = 0

    const tick = () => {
      if (destroyed) return
      rafId = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05)
      T += dt

      // Activity zones
      for (const z of zones) {
        z.phi += z.driftPhi * CFG.ACTIVITY_DRIFT_SPEED * dt * 60
        z.theta += z.driftTheta * CFG.ACTIVITY_DRIFT_SPEED * dt * 60
        z.phi = Math.max(0.01, Math.min(Math.PI-0.01, z.phi))
      }

      const pushZones = (mat: THREE.ShaderMaterial) => {
        for (let i=0;i<Math.min(zones.length,8);i++){
          const [zx,zy,zz]=zonePos(zones[i])
          ;(mat.uniforms.uZonePos.value as THREE.Vector3[])[i].set(zx,zy,zz)
          ;(mat.uniforms.uZoneEnergy.value as Float32Array)[i]=zoneEnergy(zones[i],T)
        }
      }
      pushZones(coreMat); pushZones(shellMat)
      coreMat.uniforms.uTime.value = T
      shellMat.uniforms.uTime.value = T

      core.rotation.y += CFG.CORE_ROT_Y; core.rotation.x += CFG.CORE_ROT_X
      shell.rotation.y += CFG.SHELL_ROT_Y; shell.rotation.x += CFG.SHELL_ROT_X

      const posAttr = flameGeo.attributes.position as THREE.BufferAttribute
      const lifeAttr = flameGeo.attributes.aLife as THREE.BufferAttribute
      const sizeAttr = flameGeo.attributes.aSize as THREE.BufferAttribute

      for (let i=0;i<FC;i++){
        fLife[i]+=dt
        const t=fLife[i]/Math.max(0.001,fMaxLife[i])
        if(t>=1){spawnFlame(i,T);lifeAttr.array[i]=0;posAttr.array[i*3]=fPos[i*3];posAttr.array[i*3+1]=fPos[i*3+1];posAttr.array[i*3+2]=fPos[i*3+2];sizeAttr.array[i]=fSizes[i];continue}
        lifeAttr.array[i]=1-t
        const decay=Math.pow(1-t,CFG.FLAME_DECAY)
        const curl=CFG.FLAME_CURL*dt
        const vx=fVel[i*3],vz=fVel[i*3+2]
        fVel[i*3]=vx*Math.cos(curl)-vz*Math.sin(curl)
        fVel[i*3+2]=vx*Math.sin(curl)+vz*Math.cos(curl)
        posAttr.array[i*3]=fPos[i*3]+fVel[i*3]*t*decay
        posAttr.array[i*3+1]=fPos[i*3+1]+fVel[i*3+1]*t*decay
        posAttr.array[i*3+2]=fPos[i*3+2]+fVel[i*3+2]*t*decay
      }
      posAttr.needsUpdate=true; lifeAttr.needsUpdate=true; sizeAttr.needsUpdate=true

      const breathe=1-CFG.HALO_BREATHE_DEPTH+CFG.HALO_BREATHE_DEPTH*Math.sin(T*CFG.HALO_BREATHE_SPEED)
      halo1.material.opacity=CFG.HALO1_OPACITY*breathe
      halo2.material.opacity=CFG.HALO2_OPACITY*breathe
      halo3.material.opacity=CFG.HALO3_OPACITY*breathe

      camera.position.x=Math.sin(T*CFG.CAMERA_DRIFT_SPEED)*CFG.CAMERA_DRIFT_X
      camera.position.y=Math.cos(T*CFG.CAMERA_DRIFT_SPEED*.75)*CFG.CAMERA_DRIFT_Y
      camera.lookAt(0,0,0)

      starRenderer.render(starScene,camera)
      renderer.render(scene,camera)
    }

    tick()

    return () => {
      destroyed=true; cancelAnimationFrame(rafId); ro.disconnect()
      renderer.dispose(); starRenderer.dispose()
      coreGeo.dispose(); coreMat.dispose(); shellGeo.dispose(); shellMat.dispose()
      flameGeo.dispose(); flameMat.dispose(); starGeo.dispose()
      if(mount.contains(starRenderer.domElement)) mount.removeChild(starRenderer.domElement)
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div ref={mountRef} style={{ position:'absolute', inset:0, background:'transparent' }} />
  )
}
