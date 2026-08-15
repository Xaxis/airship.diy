'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * The hull, drawn from the same shape function the model sizes with.
 *
 * The radii come from `hullRadiusAt` in packages/core, evaluated at build time
 * and handed here as an array. That matters: this is not an artist's
 * impression of an airship, it is the surface whose volume, wetted area and
 * prismatic coefficient every number on this page was computed from. Change the
 * shape parameters and the picture and the mass budget move together.
 */

export interface HullViewerProps {
  /** Hull radius at equally spaced stations from nose to tail, metres. */
  readonly radii: readonly number[]
  readonly length: number
  readonly cellCount: number
  /** Half-angle of the photovoltaic band, radians from the top of the hull. */
  readonly arrayHalfAngle: number
  readonly arrayForwardStation: number
  readonly arrayAftStation: number
}

export function HullViewer({
  radii,
  length,
  cellCount,
  arrayHalfAngle,
  arrayForwardStation,
  arrayAftStation,
}: HullViewerProps) {
  const mount = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = mount.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const root = new THREE.Group()
    scene.add(root)

    // --- the hull surface ---------------------------------------------------
    // A lathe of the real radius profile. Points run nose to tail along +X, and
    // LatheGeometry revolves about Y, so the whole group is rotated at the end
    // rather than transposing the profile here.
    const profile = radii.map((r, i) => {
      const x = (i / (radii.length - 1)) * length
      return new THREE.Vector2(Math.max(r, 1e-4), x - length / 2)
    })

    const hullGeometry = new THREE.LatheGeometry(profile, 96)

    const hull = new THREE.Mesh(
      hullGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x2c3742,
        metalness: 0.15,
        roughness: 0.72,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
      }),
    )
    root.add(hull)

    // Wireframe over the surface, so the form reads without lighting doing all
    // the work. This is a drawing, not a render.
    const wire = new THREE.Mesh(
      hullGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x4a5b6d,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
      }),
    )
    root.add(wire)

    // --- transverse rings ---------------------------------------------------
    // One main ring per gas cell bulkhead, plus nose and tail. These are the
    // members that carry gas cell radial loads and wire tension.
    const ringMaterial = new THREE.LineBasicMaterial({ color: 0x6ba8e5, transparent: true, opacity: 0.75 })

    const radiusAtStation = (station: number): number => {
      const t = station * (radii.length - 1)
      const i = Math.min(Math.floor(t), radii.length - 2)
      const f = t - i
      return (radii[i] ?? 0) * (1 - f) + (radii[i + 1] ?? 0) * f
    }

    for (let c = 0; c <= cellCount; c += 1) {
      const station = c / cellCount
      const r = radiusAtStation(station)
      if (r < 0.05) continue

      const points: THREE.Vector3[] = []
      for (let a = 0; a <= 64; a += 1) {
        const theta = (a / 64) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(theta) * r, station * length - length / 2, Math.sin(theta) * r))
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial))
    }

    // --- longitudinals ------------------------------------------------------
    // The members that carry hull bending. Drawn at the same count as a
    // historical rigid of this size would have used.
    const longitudinalCount = 12
    const longitudinalMaterial = new THREE.LineBasicMaterial({
      color: 0x33404e,
      transparent: true,
      opacity: 0.85,
    })

    for (let l = 0; l < longitudinalCount; l += 1) {
      const theta = (l / longitudinalCount) * Math.PI * 2
      const points: THREE.Vector3[] = []
      for (let i = 0; i < radii.length; i += 1) {
        const station = i / (radii.length - 1)
        const r = radii[i] ?? 0
        points.push(new THREE.Vector3(Math.cos(theta) * r, station * length - length / 2, Math.sin(theta) * r))
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), longitudinalMaterial))
    }

    // --- the photovoltaic band ---------------------------------------------
    // Drawn on the actual covered surface, between the actual stations, so the
    // area you see is the area the energy balance integrated over.
    const bandSegments = 64
    const bandRows = 40
    const bandPositions: number[] = []

    for (let i = 0; i < bandRows; i += 1) {
      const s0 = arrayForwardStation + (i / bandRows) * (arrayAftStation - arrayForwardStation)
      const s1 = arrayForwardStation + ((i + 1) / bandRows) * (arrayAftStation - arrayForwardStation)
      const r0 = radiusAtStation(s0) * 1.008
      const r1 = radiusAtStation(s1) * 1.008
      const y0 = s0 * length - length / 2
      const y1 = s1 * length - length / 2

      for (let j = 0; j < bandSegments; j += 1) {
        const t0 = -arrayHalfAngle + (j / bandSegments) * 2 * arrayHalfAngle
        const t1 = -arrayHalfAngle + ((j + 1) / bandSegments) * 2 * arrayHalfAngle

        // Theta is measured from the top of the hull, which is +Z here.
        const p = (r: number, y: number, t: number): [number, number, number] => [
          Math.sin(t) * r,
          y,
          Math.cos(t) * r,
        ]

        const a = p(r0, y0, t0)
        const b = p(r0, y0, t1)
        const c = p(r1, y1, t1)
        const d = p(r1, y1, t0)
        bandPositions.push(...a, ...b, ...c, ...a, ...c, ...d)
      }
    }

    const bandGeometry = new THREE.BufferGeometry()
    bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3))
    bandGeometry.computeVertexNormals()
    root.add(
      new THREE.Mesh(
        bandGeometry,
        new THREE.MeshStandardMaterial({
          color: 0x14406b,
          metalness: 0.55,
          roughness: 0.35,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide,
        }),
      ),
    )

    // --- gondola ------------------------------------------------------------
    // Below the hull, which is where the habitable volume has to be: no
    // enclosed space above or adjacent to a gas cell.
    const gondolaLength = length * 0.14
    const gondola = new THREE.Mesh(
      new THREE.CapsuleGeometry(radiusAtStation(0.3) * 0.16, gondolaLength, 4, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a4754, metalness: 0.3, roughness: 0.6 }),
    )
    gondola.rotation.z = Math.PI / 2
    gondola.rotation.y = Math.PI / 2
    gondola.position.set(0, -length * 0.06, -radiusAtStation(0.32) * 1.02)
    root.add(gondola)

    // --- lighting -----------------------------------------------------------
    scene.add(new THREE.AmbientLight(0x9aa7b4, 1.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(1, 1.4, 1)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x6ba8e5, 0.5)
    fill.position.set(-1, -0.4, -0.8)
    scene.add(fill)

    // Lathe revolves about Y; the hull axis should read horizontal.
    root.rotation.z = Math.PI / 2

    const resize = () => {
      const width = container.clientWidth
      const height = Math.max(Math.round(width * 0.42), 240)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.position.set(length * 0.62, length * 0.3, length * 0.78)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let frame = 0
    let stopped = false
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const tick = () => {
      if (stopped) return
      frame = requestAnimationFrame(tick)
      if (!reduceMotion) root.rotation.y += 0.0016
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.dispose()
      hullGeometry.dispose()
      bandGeometry.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [radii, length, cellCount, arrayHalfAngle, arrayForwardStation, arrayAftStation])

  return <div ref={mount} className="w-full" aria-label="Parametric hull, generated from the model's own shape function" />
}
